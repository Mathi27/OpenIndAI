from __future__ import annotations

import sqlite3
import time

from .conftest import login

MID = "og-hazrec-l1-silent-pump"
HAPPY = [
    {"type": "briefing_acknowledged"},
    {"type": "zone_entered", "target": "zone_pump_workstation"},
    {"type": "object_inspected", "target": "pump_p101"},
    {"type": "object_inspected", "target": "status_panel"},
    {"type": "object_inspected", "target": "work_docs"},
    {"type": "object_inspected", "target": "checklist_station"},
    {"type": "evidence_flagged", "target": "isolation_verification"},
    {"type": "decision_made", "value": "no_go"},
]


def seqd(events, start=1):
    return [dict(e, seq=i) for i, e in enumerate(events, start)]


def start(c, **kw):
    r = c.post("/api/sessions", json={"missionId": MID, **kw})
    assert r.status_code == 201, r.json()
    return r.json()


def test_full_mission_assessed_server_side(trainee):
    s = start(trainee)
    assert s["state"] == "BRIEFING" and s["retryCount"] == 0
    r = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(HAPPY)})
    body = r.json()
    assert r.status_code == 200
    assert body["session"]["state"] == "ASSESSED"
    res = body["session"]["result"]
    assert res["outcome"] == "mastery" and res["score"] == 100
    assert res["counters"]["criticalErrors"] == 0
    assert res["certificationNotice"] == "game_score_not_certification"
    assert trainee.get(f"/api/sessions/{s['id']}/result").json()["score"] == 100
    prog = trainee.get("/api/progress").json()
    assert prog["missions"][0]["passed"] == 1


def test_duplicate_completion_and_events_after_terminal(trainee):
    s = start(trainee)
    trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(HAPPY)})
    # Re-delivery of the same seq returns stored outcomes, no double scoring.
    r = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(HAPPY)[-1:]})
    assert r.json()["results"][0]["outcome"] == "step_completed"
    r = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": [{"seq": 99, "type": "decision_made", "value": "no_go"}]})
    assert r.json()["results"][0] == {"seq": 99, "accepted": False, "outcome": "rejected", "detail": {"outcome": "rejected", "reason": "terminal"}}
    assert trainee.get("/api/progress").json()["missions"][0]["attempts"] == 1


def test_critical_error_prevents_mastery(trainee):
    s = start(trainee)
    events = HAPPY[:7] + [
        {"type": "decision_made", "value": "go"},
        {"type": "block_acknowledged"},
        {"type": "object_inspected", "target": "work_docs"},
        {"type": "decision_made", "value": "no_go"},
    ]
    body = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(events)}).json()
    res = body["session"]["result"]
    assert res["outcome"] == "critical_error"
    assert res["score"] == 75
    assert "stopped_not_safe" in res["missedConcepts"]
    assert trainee.get("/api/progress").json()["missions"][0]["passed"] == 0


def test_terminal_failure(trainee):
    s = start(trainee)
    events = HAPPY[:3] + [
        {"type": "decision_made", "value": "go"},
        {"type": "block_acknowledged"},
        {"type": "tool_used", "target": "pump_p101", "value": "spanner"},
        {"type": "decision_made", "value": "no_go"},
    ]
    body = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(events)}).json()
    assert body["session"]["result"]["outcome"] == "not_passed"
    assert len(body["results"]) == 6  # processing stops at terminal failure


def test_invalid_references_rejected(trainee):
    s = start(trainee)
    evs = [
        {"seq": 1, "type": "briefing_acknowledged"},
        {"seq": 2, "type": "object_inspected", "target": "secret_object"},
        {"seq": 3, "type": "decision_made", "value": "maybe"},
        {"seq": 4, "type": "zone_entered", "target": "zone_pump_workstation", "value": "x"},
    ]
    res = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": evs}).json()["results"]
    assert [r["detail"].get("reason") for r in res[1:]] == ["invalid_reference"] * 3


def test_events_must_be_ordered(trainee):
    s = start(trainee)
    r = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": [{"seq": 2, "type": "paused"}, {"seq": 1, "type": "resumed"}]})
    assert r.status_code == 422


def test_unknown_event_type_validation(trainee):
    s = start(trainee)
    r = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": [{"seq": 1, "type": "mission_completed"}]})
    assert r.status_code == 422


def test_open_session_conflict_and_abandon(trainee):
    s = start(trainee)
    r = trainee.post("/api/sessions", json={"missionId": MID})
    assert r.status_code == 409 and r.json()["error"]["details"]["sessionId"] == s["id"]
    s2 = start(trainee, abandonOpen=True)
    assert s2["retryCount"] == 1
    old = trainee.get(f"/api/sessions/{s['id']}/result").json()
    assert old["outcome"] == "abandoned"
    assert trainee.get("/api/sessions/open").json()["id"] == s2["id"]


def test_abandon_terminal_rejected(trainee):
    s = start(trainee)
    assert trainee.post(f"/api/sessions/{s['id']}/abandon").status_code == 200
    assert trainee.post(f"/api/sessions/{s['id']}/abandon").status_code == 409


def test_restore_returns_event_log(trainee):
    s = start(trainee)
    trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(HAPPY[:3])})
    body = trainee.get(f"/api/sessions/{s['id']}").json()
    assert body["session"]["state"] == "ACTIVE" and len(body["events"]) == 3


def test_restore_other_users_session_not_found(trainee, make_client):
    s = start(trainee)
    other = make_client()
    other.post("/api/auth/register", json={"username": "intruder", "password": "Password1", "display_name": "X"})
    assert other.get(f"/api/sessions/{s['id']}").status_code == 404
    assert other.post(f"/api/sessions/{s['id']}/events", json={"events": [{"seq": 1, "type": "paused"}]}).status_code == 404


def test_restore_expired_session(trainee, settings):
    s = start(trainee)
    conn = sqlite3.connect(settings.db_path)
    conn.execute("UPDATE mission_sessions SET started_at = ?", (time.time() - 2 * 86400,))
    conn.commit()
    conn.close()
    r = trainee.get(f"/api/sessions/{s['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "SESSION_RESTORE_EXPIRED"
    assert trainee.get("/api/sessions/open").json() is None


def test_pause_time_excluded_from_active_time(trainee, settings):
    s = start(trainee)
    trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(HAPPY[:1] + [{"type": "paused"}])})
    conn = sqlite3.connect(settings.db_path)
    conn.execute("UPDATE mission_sessions SET paused_at = paused_at - 30, started_at = started_at - 30")
    conn.commit()
    conn.close()
    events = [dict(e, seq=i) for i, e in enumerate([{"type": "resumed"}] + HAPPY[1:], 3)]
    res = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": events}).json()["session"]["result"]
    assert res["totalMs"] >= 30000 and res["activeMs"] < 5000


def test_hint_budget_by_experience(trainee):
    trainee.put("/api/profile", json={"experience": "senior"})
    s = start(trainee)
    assert s["hintBudget"] == 1
    evs = seqd([{"type": "briefing_acknowledged"}, {"type": "hint_requested"}, {"type": "hint_requested"}])
    res = trainee.post(f"/api/sessions/{s['id']}/events", json={"events": evs}).json()["results"]
    assert [r["outcome"] for r in res] == ["step_completed", "hint", "rejected"]


def test_pip_focus_concepts_from_history(trainee):
    s = start(trainee)
    trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(HAPPY[:7] + [{"type": "decision_made", "value": "go"}])})
    trainee.post(f"/api/sessions/{s['id']}/abandon")
    trainee.put("/api/profile", json={"pathway": "pip"})
    s2 = start(trainee)
    assert "stopped_not_safe" in s2["focusConcepts"]


def test_admin_sees_trainee_results(trainee, make_client):
    s = start(trainee)
    trainee.post(f"/api/sessions/{s['id']}/events", json={"events": seqd(HAPPY)})
    admin = make_client()
    assert login(admin, "admin.dev", "Admin#2026", "admin").status_code == 200
    rows = admin.get("/api/admin/sessions").json()
    assert rows[0]["outcome"] == "mastery" and rows[0]["username"] == "trainee.dev"
    detail = admin.get(f"/api/admin/sessions/{s['id']}").json()
    assert len(detail["events"]) == len(HAPPY)
    assert any(t["username"] == "trainee.dev" for t in admin.get("/api/admin/trainees").json())


def test_admin_cannot_start_sessions(make_client):
    admin = make_client()
    login(admin, "admin.dev", "Admin#2026", "admin")
    assert admin.post("/api/sessions", json={"missionId": MID}).status_code == 403
