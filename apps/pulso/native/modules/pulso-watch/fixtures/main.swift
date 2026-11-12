import Foundation

let t0 = Date(timeIntervalSince1970: 1_792_620_000) // 2026-10-21
func ms(_ d: Date) -> Double { (d.timeIntervalSince1970 * 1000).rounded() }
let set = LiveSet(id: "s1", weightKg: 40, reps: 10, doneAt: t0.addingTimeInterval(60))
let state = try! JSONDecoder().decode(LiveSessionState.self, from: """
{"id":"live1","programId":"p1","dayId":"d1","name":"Cuerpo completo","startedAt":\(ms(t0)),"exercises":[{"id":"e1","exerciseId":"press-banca","name":"Press banca","equipment":"barbell","kind":"compound","repMin":8,"repMax":10,"restSeconds":90,"sets":[{"id":"s1","weightKg":40,"reps":10,"doneAt":null,"segments":[]}]},{"id":"e2","exerciseId":"caminadora","name":"Caminadora","equipment":"machine","kind":"cardio","modality":"treadmill","repMin":0,"repMax":0,"restSeconds":0,"sets":[],"cardio":{"durationMinutes":20,"speedKmh":6}}],"focus":0,"restStartedAt":null,"restEndsAt":null,"cardioClock":null,"version":3,"updatedAt":\(ms(t0)),"threadId":null}
""".data(using: .utf8)!)
let metrics = WatchMetrics(stage: .strength, heartRate: 121, activeKcal: 54.5, distanceMeters: nil, paused: false, totalKcal: 80, averageHeartRate: 110, elapsedFrom: t0)
var sync = WatchSync(state: state, closed: .init(id: "old", saved: true), applied: ["x1"], units: ["press-banca": .lb], plan: nil, hrZones: [HrZoneRange(zone: 2, minBpm: 118, maxBpm: 137)])
sync.recorder = .watch
let edits: [WatchEdit] = [
  WatchEdit(id: "w1", sessionId: "live1", at: t0.addingTimeInterval(61), change: .set(exerciseId: "e1", set: set)),
  WatchEdit(id: "w2", sessionId: "live1", at: t0.addingTimeInterval(62), change: .rest(startedAt: t0.addingTimeInterval(62), endsAt: t0.addingTimeInterval(152))),
  WatchEdit(id: "w3", sessionId: "live1", at: t0.addingTimeInterval(63), change: .rest(startedAt: nil, endsAt: nil)),
  WatchEdit(id: "w4", sessionId: "live1", at: t0.addingTimeInterval(64), change: .cardio(exerciseId: "e2", clock: CardioClock(exerciseId: "e2", runningSince: t0.addingTimeInterval(64), accumulated: 12.5), log: nil)),
  WatchEdit(id: "w5", sessionId: "live1", at: t0.addingTimeInterval(65), change: .finish(save: true)),
  WatchEdit(id: "w6", sessionId: "live1", at: t0.addingTimeInterval(66), change: .unit(exerciseId: "press-banca", unit: .kg)),
  WatchEdit(id: "w7", sessionId: "live1", at: t0, change: .start(state)),
]
let out: [String: WatchMessage] = ["metrics": .metrics(metrics), "stopped": .stopped, "sync": .sync(sync), "edits": .edits(edits)]
var dict: [String: Any] = [:]
for (k, m) in out { dict[k] = try! JSONSerialization.jsonObject(with: m.encoded()) }
print(String(data: try! JSONSerialization.data(withJSONObject: dict, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
