import ActivityKit
import ExpoModulesCore
import HealthKit
import Observation
import WatchConnectivity
import WidgetKit
import os

// The phone's side of the Watch and the Live Activity, for the React Native app.
// It carries the Watch's messages as the JSON the Swift side already speaks
// (apps/pulso-ios/WatchShared: `WatchMessage` encoded with a plain
// JSONEncoder, under the WatchConnectivity key "m"), so the Watch app is
// reused unchanged; JS owns the model and decodes/encodes it
// (modules/pulso-watch/src/messages.ts). Same three roads as WatchChannel.swift:
// - send: now, if the Watch is reachable (live numbers);
// - deliver: queued by the system until it arrives (transferUserInfo);
// - publish: the latest only (updateApplicationContext).
// Plus the mirrored workout session's data, the other road the Watch uses.

/// Owns WCSession and the mirroring handler from launch (the Watch's mirrored
/// workout is handed only to an app listening from the start), and holds what
/// arrives until JS listens.
final class WatchBridge: NSObject, WCSessionDelegate, HKWorkoutSessionDelegate, @unchecked Sendable {
  static let shared = WatchBridge()
  static let key = "m"
  static let log = Logger(subsystem: "com.facundo.pulso.expo", category: "watch")

  let store = HKHealthStore()
  private let lock = NSLock()
  private var pending: [(String, String)] = []
  private var mirrored: HKWorkoutSession?
  private var activatedOnce = false
  /// Set by the module while JS observes; nil buffers.
  var onMessage: ((_ json: String, _ via: String) -> Void)? {
    didSet { flush() }
  }
  var onState: (() -> Void)?

  func activate() {
    lock.lock()
    defer { lock.unlock() }
    guard !activatedOnce else { return }
    activatedOnce = true
    store.workoutSessionMirroringStartHandler = { [weak self] session in
      guard let self else { return }
      self.lock.lock()
      self.mirrored = session
      self.lock.unlock()
      session.delegate = self
    }
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  var activated: Bool { WCSession.isSupported() && WCSession.default.activationState == .activated }

  /// The Watch is recording a workout mirrored to this phone: the phone must not record one too.
  var watchRecording: Bool {
    lock.lock()
    defer { lock.unlock() }
    return mirrored != nil
  }

  var state: [String: Bool] {
    guard WCSession.isSupported() else { return ["supported": false, "activated": false, "paired": false, "installed": false, "reachable": false] }
    let s = WCSession.default
    let on = s.activationState == .activated
    return ["supported": true, "activated": on, "paired": on && s.isPaired, "installed": on && s.isWatchAppInstalled, "reachable": on && s.isReachable]
  }

  func send(_ json: String) -> Bool {
    guard activated, WCSession.default.isReachable else { return false }
    WCSession.default.sendMessageData(Data(json.utf8), replyHandler: nil) { error in Self.log.error("send: \(error)") }
    return true
  }

  func deliver(_ json: String) -> Bool {
    guard activated else { return false }
    WCSession.default.transferUserInfo([Self.key: Data(json.utf8)])
    return true
  }

  func publish(_ json: String) -> Bool {
    guard activated else { return false }
    do {
      try WCSession.default.updateApplicationContext([Self.key: Data(json.utf8)])
      return true
    } catch {
      Self.log.error("publish: \(error)")
      return false
    }
  }

  private func receive(_ data: Data?, via: String) {
    guard let data, let json = String(data: data, encoding: .utf8) else { return }
    lock.lock()
    if let onMessage {
      lock.unlock()
      onMessage(json, via)
    } else {
      pending.append((json, via))
      if pending.count > 200 { pending.removeFirst(pending.count - 200) }
      lock.unlock()
    }
  }

  private func flush() {
    lock.lock()
    guard let onMessage else { return lock.unlock() }
    let queued = pending
    pending = []
    lock.unlock()
    for (json, via) in queued { onMessage(json, via) }
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if let error { Self.log.error("activation: \(error)") }
    // What the Watch published while this app wasn't running.
    receive(session.receivedApplicationContext[Self.key] as? Data, via: "context")
    onState?()
  }

  func sessionReachabilityDidChange(_ session: WCSession) { onState?() }
  func sessionWatchStateDidChange(_ session: WCSession) { onState?() }
  func session(_ session: WCSession, didReceiveMessageData messageData: Data) { receive(messageData, via: "message") }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { receive(userInfo[Self.key] as? Data, via: "userInfo") }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { receive(applicationContext[Self.key] as? Data, via: "context") }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  /// Another Watch was chosen: start over with it.
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }

  // MARK: HKWorkoutSessionDelegate (the mirrored workout)

  func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
    guard toState == .ended || toState == .stopped else { return }
    drop(workoutSession)
  }

  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) { drop(workoutSession) }
  func workoutSession(_ workoutSession: HKWorkoutSession, didDisconnectFromRemoteDeviceWithError error: Error?) { drop(workoutSession) }

  func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
    for item in data { receive(item, via: "mirror") }
  }

  private func drop(_ session: HKWorkoutSession) {
    lock.lock()
    if mirrored === session { mirrored = nil }
    lock.unlock()
  }
}

/// The phone's own recording when no Watch records the session: the unchanged
/// `WatchShared/WorkoutManager.swift` (symlinked here, as the SwiftUI app
/// compiled it for iOS), so its rules hold as they are: one workout per session
/// from its start (backdated up to 60 s), stages as activities, the treadmill's
/// pause pausing it, never saved under 10 s, recovered once after a relaunch.
/// Its live numbers go to JS as `WatchMetrics` JSON, the Watch's own shape.
final class PhoneWorkoutBridge: @unchecked Sendable {
  static let shared = PhoneWorkoutBridge()
  private let lock = NSLock()
  private var latest: String?
  private var observing = false
  private var listener: ((String?) -> Void)?

  /// The last numbers, readable from the JS thread.
  var metricsJson: String? {
    lock.lock()
    defer { lock.unlock() }
    return latest
  }

  var onMetrics: ((String?) -> Void)? {
    get { lock.lock(); defer { lock.unlock() }; return listener }
    set { lock.lock(); listener = newValue; lock.unlock() }
  }

  /// Follows WorkoutManager's observable state; each change re-arms the tracking.
  @MainActor func observe() {
    lock.lock()
    let first = !observing
    observing = true
    lock.unlock()
    if first { track() }
  }

  @MainActor private func track() {
    let metrics = withObservationTracking { WorkoutManager.shared.metrics } onChange: {
      Task { @MainActor in PhoneWorkoutBridge.shared.track() }
    }
    let json = metrics.flatMap { try? JSONEncoder().encode($0) }.flatMap { String(data: $0, encoding: .utf8) }
    lock.lock()
    let changed = latest != json
    latest = json
    let listener = listener
    lock.unlock()
    if changed { listener?(json) }
  }
}

/// Activates the bridge at launch, before JS runs.
public class PulsoWatchAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    WatchBridge.shared.activate()
    return true
  }
}

public class PulsoWatchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PulsoWatch")

    Events("onMessage", "onState", "onWorkout")

    OnCreate {
      // In case the app delegate subscriber didn't run (it does in a normal launch).
      WatchBridge.shared.activate()
    }

    OnStartObserving {
      PhoneWorkoutBridge.shared.onMetrics = { [weak self] json in self?.sendEvent("onWorkout", ["json": json as Any]) }
      Task { @MainActor in PhoneWorkoutBridge.shared.observe() }
      WatchBridge.shared.onState = { [weak self] in self?.sendEvent("onState", WatchBridge.shared.state) }
      WatchBridge.shared.onMessage = { [weak self] json, via in self?.sendEvent("onMessage", ["json": json, "via": via]) }
    }

    OnStopObserving {
      PhoneWorkoutBridge.shared.onMetrics = nil
      WatchBridge.shared.onMessage = nil
      WatchBridge.shared.onState = nil
    }

    Function("state") { WatchBridge.shared.state }
    Function("send") { (json: String) in WatchBridge.shared.send(json) }
    Function("deliver") { (json: String) in WatchBridge.shared.deliver(json) }
    Function("publish") { (json: String) in WatchBridge.shared.publish(json) }

    /// Opens Pulso on the Watch to record a strength workout (what the phone's "Iniciar" does).
    AsyncFunction("startWatchApp") { () async throws in
      guard HKHealthStore.isHealthDataAvailable() else { throw Exception(name: "unavailable", description: "Salud no está disponible.") }
      let store = WatchBridge.shared.store
      try await store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [HKQuantityType(.heartRate)])
      let configuration = HKWorkoutConfiguration()
      configuration.activityType = .traditionalStrengthTraining
      configuration.locationType = .indoor
      try await store.startWatchApp(toHandle: configuration)
    }

    // MARK: The phone's own workout (WorkoutManager)

    Function("watchRecording") { WatchBridge.shared.watchRecording }

    /// `stageJson` is a `WorkoutStage` ({activity, indoor}); instants in epoch ms.
    AsyncFunction("workoutFollow") { (stageJson: String, paused: Bool, sinceMs: Double, stageSinceMs: Double?) async throws in
      let stage = try JSONDecoder().decode(WorkoutStage.self, from: Data(stageJson.utf8))
      let since = Date(timeIntervalSince1970: sinceMs / 1000)
      let stageSince = stageSinceMs.map { Date(timeIntervalSince1970: $0 / 1000) }
      await PhoneWorkoutBridge.shared.observe()
      await WorkoutManager.shared.follow(stage, paused: paused, since: since, stageSince: stageSince)
    }

    AsyncFunction("workoutFinish") { (save: Bool) async in
      await WorkoutManager.shared.finish(save: save)
    }

    AsyncFunction("workoutRecover") { () async in
      await PhoneWorkoutBridge.shared.observe()
      await WorkoutManager.shared.recover()
    }

    Function("workoutMetrics") { PhoneWorkoutBridge.shared.metricsJson }

    // MARK: Widgets (Shared/WidgetSnapshot.swift and SharedCredentials.swift, unchanged)

    Function("widgetsMirrorPairing") { (baseUrl: String?, token: String?) in
      guard let baseUrl, let token, let url = URL(string: baseUrl) else { return SharedCredentials.mirror(nil) }
      SharedCredentials.mirror(SharedCredentials(baseURL: url, token: token))
    }

    Function("widgetsRead") { () -> String? in
      guard let url = SnapshotStore.defaultURL, let data = try? Data(contentsOf: url) else { return nil }
      return String(data: data, encoding: .utf8)
    }

    Function("widgetsWrite") { (json: String) -> Bool in
      guard let snapshot = try? SnapshotStore.decode(Data(json.utf8)) else { return false }
      SnapshotStore.save(snapshot)
      return true
    }

    Function("widgetsClear") { SnapshotStore.clear() }

    Function("widgetsReload") { WidgetCenter.shared.reloadAllTimelines() }

    // MARK: Live Activity (PulsoActivity's `TrainingActivityAttributes`)

    Function("activitiesEnabled") { ActivityAuthorizationInfo().areActivitiesEnabled }

    Function("activityIds") { Activity<TrainingActivityAttributes>.activities.map(\.id) }

    /// Starts one; the JSON is Swift's encoding of the attributes and its state (messages.ts). Returns its id.
    AsyncFunction("startActivity") { (attributesJson: String, stateJson: String) async throws -> String in
      let decoder = JSONDecoder()
      let attributes = try decoder.decode(TrainingActivityAttributes.self, from: Data(attributesJson.utf8))
      let state = try decoder.decode(TrainingActivityAttributes.ContentState.self, from: Data(stateJson.utf8))
      let activity = try Activity.request(attributes: attributes, content: .init(state: state, staleDate: nil), pushType: nil)
      return activity.id
    }

    AsyncFunction("updateActivity") { (id: String, stateJson: String) async throws in
      let state = try JSONDecoder().decode(TrainingActivityAttributes.ContentState.self, from: Data(stateJson.utf8))
      guard let activity = Activity<TrainingActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
      await activity.update(.init(state: state, staleDate: nil))
    }

    AsyncFunction("endActivity") { (id: String?) async in
      for activity in Activity<TrainingActivityAttributes>.activities where id == nil || activity.id == id {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
