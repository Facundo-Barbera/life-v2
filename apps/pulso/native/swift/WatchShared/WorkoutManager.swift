import HealthKit
import Observation
import os

/// The workout recorded for the session, on the Watch or (without one) on the
/// iPhone, which takes the heart rate from AirPods Pro 3 or another monitor
/// when one is worn. ONE workout per session, a strength workout from the
/// session's start to its end, saved once. It follows the session (`follow`):
/// each stage (strength, or the kind of the cardio block on its clock) is an
/// activity of that workout, and pausing the block pauses the workout. The
/// activities keep the workout's own kind (the stage's goes in their metadata):
/// a walk activity inside a strength workout failed on the person's Watch, and
/// the old fallback (a workout per stage) left Fitness with strength 0:00,
/// walk, strength 0:00… and the Watch's time back at 0 on every pause.
/// On the Watch the numbers go to the phone live: over the mirrored session,
/// else WatchConnectivity.
@MainActor
@Observable
final class WorkoutManager: NSObject {
    static let shared = WorkoutManager()

    let store = HKHealthStore()
    private(set) var stage: WorkoutStage?
    private(set) var heartRate: Double?
    /// When the last heart rate was measured: a monitor taken off stops sending.
    private(set) var heartRateAt: Date?
    private(set) var activeKcal: Double = 0
    private(set) var distanceMeters: Double?
    private(set) var paused = false
    private(set) var totalKcal: Double?
    private(set) var averageHeartRate: Double?
    private(set) var steps: Double?
    private(set) var paceSecondsPerKm: Double?
    private(set) var cadence: Double?
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var lastSent = Date.distantPast
    /// False once this device failed a stage as an activity: the workout carries on without them.
    private var activities = true
    private var starting = false
    private var recovering: Task<Void, Never>?
    /// The pause the session last asked for: only a change acts, so the Watch's own Pausa holds.
    private var followedPause = false

    private nonisolated static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Pulso", category: "workout")
    /// A heart rate older than this isn't "now": the monitor is off or gone.
    static let heartRateFresh: TimeInterval = 20
    private static let bpm = HKUnit.count().unitDivided(by: .minute())

    var running: Bool { session != nil }

    /// Time recorded by the workout in progress (pauses left out).
    func elapsed(at date: Date) -> TimeInterval { builder?.elapsedTime(at: date) ?? 0 }

    /// The heart rate if measured lately; nil with the monitor off.
    func currentHeartRate(at date: Date = .now) -> Double? {
        guard let heartRateAt, date.timeIntervalSince(heartRateAt) < Self.heartRateFresh else { return nil }
        return heartRate
    }

    /// The numbers now, as the phone shows them; nil while nothing records.
    var metrics: WatchMetrics? {
        guard session != nil, let stage else { return nil }
        let now = Date()
        let recorded = elapsed(at: now)
        return WatchMetrics(stage: stage, heartRate: currentHeartRate(), activeKcal: activeKcal, distanceMeters: distanceMeters, paused: paused,
                            totalKcal: totalKcal, averageHeartRate: averageHeartRate, steps: steps, paceSecondsPerKm: paceSecondsPerKm, cadence: cadence,
                            elapsedFrom: paused ? nil : now.addingTimeInterval(-recorded), elapsedSeconds: recorded)
    }

    // MARK: Following the session

    /// Records `stage`: starts the workout (from `since`, the session's start,
    /// when it began before the recording), or moves it to that stage (from
    /// `stageSince`, when its cardio clock started). Both sides pass the
    /// session's own instants, so the workout's time is the session's time and
    /// not "when this device heard about it" (on the Watch, ~2 s later).
    /// `paused`: the cardio block in focus is paused, so is the workout (pause and
    /// resume, never end and start: its time carries on from where it stood).
    func follow(_ next: WorkoutStage, paused: Bool = false, since: Date? = nil, stageSince: Date? = nil) async {
        guard !starting else { return }
        for step in Self.steps(running: session != nil, stage: stage, followedPause: followedPause, next: next, paused: paused) {
            switch step {
            case .start: await start(next, at: since)
            case .stage: await change(to: next, at: stageSince)
            case .pause:
                followedPause = true
                pause()
            case .resume:
                followedPause = false
                resume()
            }
        }
    }

    enum FollowStep: Equatable { case start, stage, pause, resume }

    /// What following the session does to the workout. A workout running is
    /// never started again: a new stage is an activity of it, a pause a pause.
    nonisolated static func steps(running: Bool, stage: WorkoutStage?, followedPause: Bool, next: WorkoutStage, paused: Bool) -> [FollowStep] {
        var steps: [FollowStep] = []
        if !running { steps.append(.start) } else if next != stage { steps.append(.stage) }
        if paused != followedPause { steps.append(paused ? .pause : .resume) }
        return steps
    }

    /// The longest a workout is backdated to the session's start: later than this
    /// it joined late (or the session is a stale copy) and starts now.
    nonisolated static let backdateLimit: TimeInterval = 60
    /// Shorter than this a recording is a slip, not a workout: it isn't saved.
    nonisolated static let minimumSeconds: TimeInterval = 10

    /// When the workout starts: the session's start when recent, never in the future (the other device's clock may run ahead).
    nonisolated static func startDate(_ since: Date?, now: Date) -> Date {
        guard let since, now.timeIntervalSince(since) <= backdateLimit else { return now }
        return min(since, now)
    }

    /// Whether a finished recording goes to Salud: asked to, and long enough to be one.
    nonisolated static func keeps(save: Bool, recorded: TimeInterval) -> Bool { save && recorded >= minimumSeconds }

    /// When a new stage starts: at `since` when given, kept after the current stage's start and not in the future.
    nonisolated static func stageDate(_ since: Date?, current: Date?, now: Date) -> Date {
        min(max(since ?? now, current ?? .distantPast), now)
    }

    private static var types: (share: Set<HKSampleType>, read: Set<HKObjectType>) {
        let distances: [HKQuantityType] = [HKQuantityType(.distanceWalkingRunning), HKQuantityType(.distanceCycling), HKQuantityType(.distanceRowing)]
        let energy = [HKQuantityType(.activeEnergyBurned), HKQuantityType(.basalEnergyBurned), HKQuantityType(.stepCount)]
        return (Set([HKObjectType.workoutType()] + energy + distances), Set([HKObjectType.workoutType(), HKQuantityType(.heartRate)] + energy + distances))
    }

    private func authorize() async {
        let (share, read) = Self.types
        do { try await store.requestAuthorization(toShare: share, read: read) } catch { Self.log.error("authorization: \(error)") }
    }

    /// A new workout recording `stage` as its first activity.
    func start(_ stage: WorkoutStage, at startDate: Date? = nil) async {
        guard session == nil, !starting else { return }
        starting = true
        defer { starting = false }
        // Asked once already, the asking (new kinds of data) doesn't hold the start.
        let (share, read) = Self.types
        if (try? await store.statusForAuthorizationRequest(toShare: share, read: read)) == .shouldRequest {
            await authorize()
        }
        // One left running by a previous launch blocks a new one: carry on with it.
        await recover()
        if session != nil {
            if stage != self.stage { await change(to: stage) }
            return
        }
        do {
            // The workout's own kind stays strength: the visit is a strength session with parts.
            let configuration = WorkoutStage.strength.configuration
            let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self
            adopt(session, builder, stage: stage)
            let start = Self.startDate(startDate, now: Date())
            session.prepare()
            session.startActivity(with: start)
            try await builder.beginCollection(at: start)
            if activities { begin(stage, at: start) } else { enableCollection(for: stage) }
            send(force: true)
            #if os(watchOS)
            try? await session.startMirroringToCompanionDevice()
            #endif
        } catch {
            Self.log.error("start \(stage.title): \(error)")
        }
    }

    /// The app came back after it was killed mid-workout: the same workout
    /// carries on (time, pauses and all), never a new one. The launch's
    /// recovery and the first sync both ask; they share one attempt.
    func recover() async {
        guard session == nil else { return }
        if let recovering { return await recovering.value }
        let attempt = Task { await recoverOnce() }
        recovering = attempt
        await attempt.value
        recovering = nil
    }

    private func recoverOnce() async {
        guard session == nil else { return }
        do {
            guard let session = try await store.recoverActiveWorkoutSession() else { return }
            let builder = session.associatedWorkoutBuilder()
            // The live numbers don't come back with it.
            if builder.dataSource == nil {
                builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: session.workoutConfiguration)
            }
            session.delegate = self
            builder.delegate = self
            adopt(session, builder, stage: WorkoutStage(builder.currentWorkoutActivity?.workoutConfiguration ?? session.workoutConfiguration))
            #if os(watchOS)
            try? await session.startMirroringToCompanionDevice()
            #endif
        } catch {
            Self.log.error("recover: \(error)")
        }
    }

    private func adopt(_ session: HKWorkoutSession, _ builder: HKLiveWorkoutBuilder, stage: WorkoutStage) {
        self.session = session
        self.builder = builder
        self.stage = stage
        heartRate = nil
        heartRateAt = nil
        activeKcal = 0
        distanceMeters = nil
        paused = session.state == .paused
        followedPause = paused
        totalKcal = nil
        averageHeartRate = nil
        clearStageNumbers()
    }

    private func clearStageNumbers() {
        distanceMeters = nil
        steps = nil
        paceSecondsPerKm = nil
        cadence = nil
    }

    /// The next stage, in the same workout.
    private func change(to next: WorkoutStage, at since: Date? = nil) async {
        guard let session else { return }
        stage = next
        clearStageNumbers()
        if activities {
            let at = Self.stageDate(since, current: builder?.currentWorkoutActivity?.startDate, now: Date())
            if builder?.currentWorkoutActivity != nil { session.endCurrentActivity(on: at) }
            begin(next, at: at)
        } else {
            enableCollection(for: next)
        }
        send(force: true)
    }

    /// The key naming a stage's kind on its activity, as the activity itself keeps the workout's kind.
    nonisolated static let stageKey = "PulsoStage"

    private func begin(_ stage: WorkoutStage, at date: Date) {
        guard let session else { return }
        session.beginNewActivity(configuration: session.workoutConfiguration, date: date, metadata: [Self.stageKey: stage.title])
        enableCollection(for: stage)
    }

    private func enableCollection(for stage: WorkoutStage) {
        if let source = builder?.dataSource {
            source.enableCollection(for: HKQuantityType(.basalEnergyBurned), predicate: nil)
            if let distance = stage.activityType.distanceType { source.enableCollection(for: distance, predicate: nil) }
            if stage.countsSteps { source.enableCollection(for: HKQuantityType(.stepCount), predicate: nil) }
        }
    }

    /// Something failed in the workout: it carries on as one, without activities
    /// from now on. Never a new workout (Fitness got one per stage that way).
    private func failed(_ failing: HKWorkoutSession) async {
        guard failing === session, activities else { return }
        Self.log.error("activities failed: the workout carries on without them")
        activities = false
    }

    /// Ends the workout in progress: into Salud and Fitness, or thrown away.
    func finish(save: Bool) async {
        guard let session, let builder else { return }
        self.session = nil
        self.builder = nil
        stage = nil
        followedPause = false
        let end = Date()
        let recorded = builder.elapsedTime(at: end)
        if builder.currentWorkoutActivity != nil { session.endCurrentActivity(on: end) }
        session.end()
        do {
            try await builder.endCollection(at: end)
            if Self.keeps(save: save, recorded: recorded) { _ = try await builder.finishWorkout() } else { builder.discardWorkout() }
        } catch {
            Self.log.error("finish: \(error)")
        }
        say(.stopped)
    }

    func pause() { session?.pause() }
    func resume() { session?.resume() }

    // MARK: Numbers to the phone

    /// By the mirrored session, else by WatchConnectivity. On the phone the numbers are read here.
    private func say(_ message: WatchMessage) {
        #if os(watchOS)
        guard let data = try? message.encoded() else { return }
        guard let session else {
            WatchChannel.shared.send(message)
            return
        }
        Task {
            do {
                try await session.sendToRemoteWorkoutSession(data: data)
            } catch {
                WatchChannel.shared.send(message)
            }
        }
        #endif
    }

    /// On every change of state, else once a second at most.
    private func send(force: Bool = false) {
        guard let metrics, force || Date().timeIntervalSince(lastSent) >= 1 else { return }
        lastSent = Date()
        say(.metrics(metrics))
    }

    private func collect(_ builder: HKLiveWorkoutBuilder, _ types: Set<HKSampleType>) {
        guard builder === self.builder else { return }
        if types.contains(HKQuantityType(.heartRate)) {
            let statistics = builder.statistics(for: HKQuantityType(.heartRate))
            heartRate = statistics?.mostRecentQuantity()?.doubleValue(for: Self.bpm)
            heartRateAt = statistics?.mostRecentQuantityDateInterval()?.end
            averageHeartRate = statistics?.averageQuantity()?.doubleValue(for: Self.bpm)
        }
        if types.contains(HKQuantityType(.activeEnergyBurned)) || types.contains(HKQuantityType(.basalEnergyBurned)) {
            activeKcal = sum(builder, .activeEnergyBurned, .kilocalorie(), stage: false) ?? 0
            totalKcal = activeKcal + (sum(builder, .basalEnergyBurned, .kilocalorie(), stage: false) ?? 0)
        }
        // This stage's numbers: the treadmill block, not the whole visit.
        if let distance = stage?.activityType.distanceType, types.contains(distance) {
            distanceMeters = (builder.currentWorkoutActivity?.statistics(for: distance) ?? builder.statistics(for: distance))?.sumQuantity()?.doubleValue(for: .meter())
        }
        if types.contains(HKQuantityType(.stepCount)) {
            steps = sum(builder, .stepCount, .count(), stage: true)
        }
        let minutes = stageElapsed(builder) / 60
        if let meters = distanceMeters, meters > 10 { paceSecondsPerKm = minutes * 60 / (meters / 1000) }
        if let steps, minutes > 0.5 { cadence = steps / minutes }
        send()
    }

    private func sum(_ builder: HKLiveWorkoutBuilder, _ id: HKQuantityTypeIdentifier, _ unit: HKUnit, stage: Bool) -> Double? {
        let type = HKQuantityType(id)
        let statistics = stage ? builder.currentWorkoutActivity?.statistics(for: type) ?? builder.statistics(for: type) : builder.statistics(for: type)
        return statistics?.sumQuantity()?.doubleValue(for: unit)
    }

    /// Time in the stage now: since its activity began, else the whole workout.
    private func stageElapsed(_ builder: HKLiveWorkoutBuilder) -> TimeInterval {
        if let start = builder.currentWorkoutActivity?.startDate, activities == true { return Date().timeIntervalSince(start) }
        return builder.elapsedTime
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
            guard workoutSession === session else { return }
            paused = toState == .paused
            send(force: true)
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Self.log.error("session failed: \(error)")
        Task { @MainActor in await failed(workoutSession) }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
        // The phone speaks over WatchConnectivity: the session's copy is more than this road carries.
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        Task { @MainActor in collect(workoutBuilder, collectedTypes) }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

}
