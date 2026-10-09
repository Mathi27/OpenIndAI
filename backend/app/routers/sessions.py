"""Mission session lifecycle and event ingestion.

The client streams gameplay events; the server re-validates every event
against the mission definition with its own engine, timestamps it, and is the
only party that computes scores and progress."""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends

from .. import db, engine
from ..config import Settings
from ..content import MissionDef, apply_variant, load_missions, load_questions
from ..deps import CurrentUser, get_conn, get_settings_dep, require_client_header, require_trainee
from ..errors import APIError
from ..progression import mission_status
from ..schemas import EventBatch, EventResult, EventsResponse, McqSubmission, SessionOut, StartSessionRequest
from ..scoring import PASSING_OUTCOMES, assess
from .profile import load_me

router = APIRouter(prefix="/api/sessions", tags=["sessions"], dependencies=[Depends(require_client_header)])

MAX_EVENTS_PER_SESSION = 2000
OPEN_STATES = ("BRIEFING", "ACTIVE", "PAUSED", "BLOCKED")
OUTCOME_RANK = {"abandoned": 0, "not_passed": 1, "critical_error": 2, "needs_practice": 3, "pass": 4, "mastery": 5}


def _mission(settings: Settings, mission_id: str) -> MissionDef:
    entry = load_missions(settings.shared_dir).get(mission_id)
    if entry is None:
        raise APIError(404, "MISSION_NOT_FOUND", "That mission does not exist.")
    return entry[0]


def _ctx(mission: MissionDef, row: sqlite3.Row) -> engine.Context:
    return engine.Context(pathway=row["pathway"], hintBudget=mission.hints.budget[row["experience"]])


def _focus_concepts(conn: sqlite3.Connection, user_id: int, before: float) -> list[str]:
    rows = conn.execute(
        "SELECT result FROM mission_sessions WHERE user_id = ? AND result IS NOT NULL AND started_at < ? "
        "ORDER BY started_at DESC LIMIT 5",
        (user_id, before),
    ).fetchall()
    concepts: list[str] = []
    for r in rows:
        for c in json.loads(r["result"]).get("missedConcepts", []):
            if c not in concepts:
                concepts.append(c)
    return concepts


def _serialize(conn: sqlite3.Connection, settings: Settings, row: sqlite3.Row) -> SessionOut:
    mission = _mission(settings, row["mission_id"])
    focus = _focus_concepts(conn, row["user_id"], row["started_at"]) if row["pathway"] == "pip" else []
    return SessionOut(
        id=row["id"], missionId=row["mission_id"], missionVersion=row["mission_version"], state=row["state"],
        experience=row["experience"], pathway=row["pathway"], retryCount=row["retry_count"],
        startedAt=row["started_at"], endedAt=row["ended_at"], endReason=row["end_reason"], lastSeq=row["last_seq"],
        hintBudget=mission.hints.budget[row["experience"]], engine=json.loads(row["engine_state"]), variant=row["variant"],
        pausedMs=row["paused_ms"], pausedAt=row["paused_at"], serverTime=time.time(),
        focusConcepts=focus, result=json.loads(row["result"]) if row["result"] else None,
    )


def _owned(conn: sqlite3.Connection, session_id: str, user_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM mission_sessions WHERE id = ?", (session_id,)).fetchone()
    # Do not reveal whether another user's session exists.
    if row is None or row["user_id"] != user_id:
        raise APIError(404, "SESSION_NOT_FOUND", "That training session was not found.")
    return row


def _finalise(conn: sqlite3.Connection, settings: Settings, row: sqlite3.Row, st: engine.EngineState, end_reason: str) -> dict[str, Any]:
    """Assess a COMPLETED/FAILED session exactly once and update progress."""
    mission = _mission(settings, row["mission_id"])
    now = time.time()
    paused_ms = row["paused_ms"]
    if row["paused_at"] is not None:
        paused_ms += int((now - row["paused_at"]) * 1000)
    total_ms = int((now - row["started_at"]) * 1000)
    result = assess(mission, st, _ctx(mission, row), end_reason)
    result.update({
        "missionId": row["mission_id"], "missionVersion": row["mission_version"], "retryCount": row["retry_count"],
        "finalState": st.state, "endReason": end_reason, "totalMs": total_ms, "activeMs": max(0, total_ms - paused_ms),
        "startedAt": row["started_at"], "completedAt": now, "experience": row["experience"], "pathway": row["pathway"],
    })
    engine.assess(st)
    conn.execute(
        "UPDATE mission_sessions SET state = ?, ended_at = ?, end_reason = ?, paused_at = NULL, paused_ms = ?, "
        "engine_state = ?, score = ?, outcome = ?, result = ? WHERE id = ? AND state NOT IN ('ASSESSED')",
        (st.state, now, end_reason, paused_ms, json.dumps(st.to_json()), result["score"], result["outcome"], json.dumps(result), row["id"]),
    )
    prev = conn.execute("SELECT * FROM progress WHERE user_id = ? AND mission_id = ?", (row["user_id"], row["mission_id"])).fetchone()
    # Progression ("passed") additionally requires the knowledge check; see submit_mcq.
    passed = False
    if prev is None:
        conn.execute(
            "INSERT INTO progress (user_id, mission_id, attempts, best_score, best_outcome, passed, last_session_id, updated_at) "
            "VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
            (row["user_id"], row["mission_id"], result["score"], result["outcome"], int(passed), row["id"], now),
        )
    else:
        best_outcome = prev["best_outcome"]
        if OUTCOME_RANK.get(result["outcome"], 0) > OUTCOME_RANK.get(best_outcome or "", -1):
            best_outcome = result["outcome"]
        conn.execute(
            "UPDATE progress SET attempts = attempts + 1, best_score = MAX(COALESCE(best_score, 0), ?), best_outcome = ?, "
            "passed = MAX(passed, ?), last_session_id = ?, updated_at = ? WHERE user_id = ? AND mission_id = ?",
            (result["score"], best_outcome, int(passed), row["id"], now, row["user_id"], row["mission_id"]),
        )
    return result


def _abandon_row(conn: sqlite3.Connection, settings: Settings, row: sqlite3.Row, reason: str) -> None:
    st = engine.EngineState.from_json(json.loads(row["engine_state"]))
    if st.state in engine.TERMINAL:
        return
    engine.abandon(st)
    _finalise(conn, settings, row, st, reason)


@router.post("", response_model=SessionOut, status_code=201)
def start_session(body: StartSessionRequest, user: CurrentUser = Depends(require_trainee),
                  conn: sqlite3.Connection = Depends(get_conn), settings: Settings = Depends(get_settings_dep)) -> SessionOut:
    me = load_me(conn, user.id)
    if not me.profile.complete:
        raise APIError(409, "PROFILE_INCOMPLETE", "Complete your profile before starting a mission.")
    mission = _mission(settings, body.missionId)
    if mission.industry != me.profile.industry:
        raise APIError(403, "MISSION_INDUSTRY_MISMATCH", "This mission belongs to a different industry.")
    status, reason = mission_status(conn, settings, user.id, mission, me.profile.designation or "")
    if status != "available":
        raise APIError(403, "MISSION_LOCKED", "This mission is locked for your profile.", {"reason": reason})

    with db.transaction(conn):
        open_rows = conn.execute(
            f"SELECT * FROM mission_sessions WHERE user_id = ? AND state IN ({','.join('?' * len(OPEN_STATES))})",
            (user.id, *OPEN_STATES),
        ).fetchall()
        if open_rows and not body.abandonOpen:
            raise APIError(409, "OPEN_SESSION_EXISTS", "You already have a training session in progress.",
                           {"sessionId": open_rows[0]["id"], "missionId": open_rows[0]["mission_id"]})
        for r in open_rows:
            _abandon_row(conn, settings, r, "abandoned")
        retry_count = conn.execute(
            "SELECT COUNT(*) FROM mission_sessions WHERE user_id = ? AND mission_id = ?", (user.id, mission.id)
        ).fetchone()[0]
        # Deterministic, reviewed-variant selection: rotate through the declared order by attempt.
        order = mission.variantPolicy.order
        variant = order[retry_count % len(order)]
        st = engine.EngineState()
        engine.start(st)
        session_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO mission_sessions (id, user_id, mission_id, mission_version, state, experience, pathway, retry_count, "
            "started_at, engine_state, variant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (session_id, user.id, mission.id, mission.version, st.state, me.profile.experience, me.profile.pathway,
             retry_count, time.time(), json.dumps(st.to_json()), variant),
        )
    return _serialize(conn, settings, _owned(conn, session_id, user.id))


@router.get("/open", response_model=SessionOut | None)
def open_session(user: CurrentUser = Depends(require_trainee), conn: sqlite3.Connection = Depends(get_conn),
                 settings: Settings = Depends(get_settings_dep)) -> SessionOut | None:
    row = conn.execute(
        f"SELECT * FROM mission_sessions WHERE user_id = ? AND state IN ({','.join('?' * len(OPEN_STATES))}) "
        "ORDER BY started_at DESC LIMIT 1",
        (user.id, *OPEN_STATES),
    ).fetchone()
    return _serialize(conn, settings, row) if row else None


@router.get("/{session_id}")
def get_session(session_id: str, user: CurrentUser = Depends(require_trainee), conn: sqlite3.Connection = Depends(get_conn),
                settings: Settings = Depends(get_settings_dep)) -> dict[str, Any]:
    """Used to restore a session after a page refresh. Validates that the
    session can still be restored and returns the accepted event log."""
    row = _owned(conn, session_id, user.id)
    if row["state"] in OPEN_STATES:
        mission = _mission(settings, row["mission_id"])
        reason = None
        if mission.version != row["mission_version"]:
            reason = ("SESSION_STALE", "This mission has been updated since the session started; it cannot be restored.")
        elif time.time() - row["started_at"] > settings.mission_restore_ttl_seconds:
            reason = ("SESSION_RESTORE_EXPIRED", "This session is too old to restore.")
        if reason:
            with db.transaction(conn):
                _abandon_row(conn, settings, _owned(conn, session_id, user.id), "restore_invalid")
            raise APIError(409, reason[0], reason[1])
    events = conn.execute(
        "SELECT seq, type, target, value, accepted, outcome FROM mission_events WHERE session_id = ? ORDER BY seq",
        (session_id,),
    ).fetchall()
    return {"session": _serialize(conn, settings, row).model_dump(), "events": [dict(e) for e in events]}


def _validate_reference(mission: MissionDef, ev: dict[str, Any]) -> str | None:
    t, target, value = ev["type"], ev.get("target"), ev.get("value")
    zones = {z.id for z in mission.zones}
    npcs = {n.id for n in mission.npcs}
    objects = {i.id for i in mission.interactables}
    evidence = {e.id for e in mission.evidence}
    tools = {x.id for x in mission.tools}
    decisions = {d.value for d in mission.decisions}
    steps = {s.id for s in mission.steps}
    checks = {
        "zone_entered": target in zones and value is None,
        "npc_interacted": target in npcs and value is None,
        "object_inspected": target in objects and value is None,
        "tool_selected": value in tools and target is None,
        "tool_used": value in tools and (target is None or target in objects),
        "evidence_flagged": target in evidence and value is None,
        "decision_made": value in decisions and target is None,
        "hint_requested": (target is None or target in steps) and value is None,
    }
    ok = checks.get(t, target is None and value is None)
    return None if ok else "invalid_reference"


@router.post("/{session_id}/events", response_model=EventsResponse)
def post_events(session_id: str, body: EventBatch, user: CurrentUser = Depends(require_trainee),
                conn: sqlite3.Connection = Depends(get_conn), settings: Settings = Depends(get_settings_dep)) -> EventsResponse:
    seqs = [e.seq for e in body.events]
    if seqs != sorted(seqs) or len(set(seqs)) != len(seqs):
        raise APIError(422, "EVENTS_OUT_OF_ORDER", "Events must be sent in strictly increasing sequence order.")
    results: list[EventResult] = []
    with db.transaction(conn):
        row = _owned(conn, session_id, user.id)
        mission = _mission(settings, row["mission_id"])
        if mission.version != row["mission_version"]:
            raise APIError(409, "SESSION_STALE", "This mission has been updated; please restart it.")
        count = conn.execute("SELECT COUNT(*) FROM mission_events WHERE session_id = ?", (session_id,)).fetchone()[0]
        if count + len(body.events) > MAX_EVENTS_PER_SESSION:
            raise APIError(429, "EVENT_LIMIT", "Too many events for this session.")
        st = engine.EngineState.from_json(json.loads(row["engine_state"]))
        ctx = _ctx(mission, row)
        paused_at, paused_ms = row["paused_at"], row["paused_ms"]
        finished: str | None = None
        for ev in body.events:
            existing = conn.execute(
                "SELECT accepted, outcome, detail FROM mission_events WHERE session_id = ? AND seq = ?", (session_id, ev.seq)
            ).fetchone()
            if existing is not None:
                # Idempotent re-delivery: return the stored outcome, never re-score.
                results.append(EventResult(seq=ev.seq, accepted=bool(existing["accepted"]), outcome=existing["outcome"],
                                           detail=json.loads(existing["detail"] or "{}")))
                continue
            data = ev.model_dump()
            now = time.time()
            if ev.seq <= st.lastSeq:
                detail = {"outcome": "rejected", "reason": "stale_seq"}
            elif (bad := _validate_reference(mission, data)) is not None:
                st.lastSeq = ev.seq
                st.counters.rejected += 1
                detail = {"outcome": "rejected", "reason": bad}
            else:
                detail = engine.apply(mission, st, data, ctx)
            outcome = detail["outcome"]
            accepted = outcome != "rejected"
            if outcome == "paused":
                paused_at = now
            elif outcome == "resumed" and paused_at is not None:
                paused_ms += int((now - paused_at) * 1000)
                paused_at = None
            conn.execute(
                "INSERT INTO mission_events (session_id, seq, type, target, value, client_ts, server_ts, accepted, outcome, detail) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (session_id, ev.seq, ev.type, ev.target, ev.value, ev.clientTs, now, int(accepted), outcome, json.dumps(detail)),
            )
            results.append(EventResult(seq=ev.seq, accepted=accepted, outcome=outcome, detail=detail))
            if st.state in (engine.COMPLETED, engine.FAILED):
                finished = "completed" if st.state == engine.COMPLETED else "critical_failure"
                break
        conn.execute(
            "UPDATE mission_sessions SET state = ?, last_seq = ?, engine_state = ?, paused_at = ?, paused_ms = ? WHERE id = ?",
            (st.state, st.lastSeq, json.dumps(st.to_json()), paused_at, paused_ms, session_id),
        )
        if finished:
            _finalise(conn, settings, _owned(conn, session_id, user.id), st, finished)
    return EventsResponse(results=results, session=_serialize(conn, settings, _owned(conn, session_id, user.id)))


@router.post("/{session_id}/abandon", response_model=SessionOut)
def abandon_session(session_id: str, user: CurrentUser = Depends(require_trainee), conn: sqlite3.Connection = Depends(get_conn),
                    settings: Settings = Depends(get_settings_dep)) -> SessionOut:
    with db.transaction(conn):
        row = _owned(conn, session_id, user.id)
        if row["state"] not in OPEN_STATES:
            raise APIError(409, "SESSION_TERMINAL", "This session has already ended.")
        _abandon_row(conn, settings, row, "abandoned")
    return _serialize(conn, settings, _owned(conn, session_id, user.id))


@router.get("/{session_id}/result")
def session_result(session_id: str, user: CurrentUser = Depends(require_trainee), conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    row = _owned(conn, session_id, user.id)
    if row["result"] is None:
        raise APIError(409, "RESULT_NOT_READY", "This session has not been assessed yet.")
    return json.loads(row["result"])


@router.get("/{session_id}/mission")
def session_mission(session_id: str, user: CurrentUser = Depends(require_trainee), conn: sqlite3.Connection = Depends(get_conn),
                    settings: Settings = Depends(get_settings_dep)) -> dict[str, Any]:
    """The effective mission definition (scenario variant applied) for this session."""
    row = _owned(conn, session_id, user.id)
    entry = load_missions(settings.shared_dir).get(row["mission_id"])
    if entry is None:
        raise APIError(404, "MISSION_NOT_FOUND", "That mission does not exist.")
    return apply_variant(entry[2], row["variant"])


def _mcq_available(row: sqlite3.Row) -> dict[str, Any]:
    if row["result"] is None:
        raise APIError(409, "RESULT_NOT_READY", "This session has not been assessed yet.")
    result = json.loads(row["result"])
    if result.get("finalState") != "COMPLETED" or result.get("endReason") != "completed":
        raise APIError(409, "MCQ_NOT_AVAILABLE", "The knowledge check is available after completing the mission.")
    return result


def _server_event(conn: sqlite3.Connection, session_id: str, etype: str, detail: dict[str, Any]) -> None:
    """Server-generated audit events (outside the gameplay engine)."""
    seq = conn.execute("SELECT COALESCE(MAX(seq), 0) + 1 FROM mission_events WHERE session_id = ?", (session_id,)).fetchone()[0]
    conn.execute(
        "INSERT INTO mission_events (session_id, seq, type, target, value, client_ts, server_ts, accepted, outcome, detail) "
        "VALUES (?, ?, ?, NULL, NULL, NULL, ?, 1, 'recorded', ?)",
        (session_id, seq, etype, time.time(), json.dumps(detail)),
    )
    conn.execute("UPDATE mission_sessions SET last_seq = ? WHERE id = ?", (seq, session_id))


@router.get("/{session_id}/mcq")
def get_mcq(session_id: str, user: CurrentUser = Depends(require_trainee), conn: sqlite3.Connection = Depends(get_conn),
            settings: Settings = Depends(get_settings_dep)) -> dict[str, Any]:
    row = _owned(conn, session_id, user.id)
    _mcq_available(row)
    mission = _mission(settings, row["mission_id"])
    bank = load_questions(settings.shared_dir)
    questions = []
    for qid in mission.mcq.questionIds:
        q = bank[qid]
        # The correct answer is never sent before submission.
        questions.append({"id": q.id, "stemKey": q.stemKey, "options": [o.model_dump() for o in q.options], "reviewStatus": q.reviewStatus})
    prior = conn.execute("SELECT result FROM mcq_responses WHERE session_id = ?", (session_id,)).fetchone()
    return {"questions": questions, "passFraction": mission.mcq.passFraction, "submitted": json.loads(prior["result"]) if prior else None}


@router.post("/{session_id}/mcq")
def submit_mcq(session_id: str, body: McqSubmission, user: CurrentUser = Depends(require_trainee),
               conn: sqlite3.Connection = Depends(get_conn), settings: Settings = Depends(get_settings_dep)) -> dict[str, Any]:
    mission_entry = None
    with db.transaction(conn):
        row = _owned(conn, session_id, user.id)
        result = _mcq_available(row)
        if conn.execute("SELECT 1 FROM mcq_responses WHERE session_id = ?", (session_id,)).fetchone():
            raise APIError(409, "MCQ_ALREADY_SUBMITTED", "The knowledge check for this session was already submitted.")
        mission = _mission(settings, row["mission_id"])
        bank = load_questions(settings.shared_dir)
        expected = set(mission.mcq.questionIds)
        if set(body.answers) != expected:
            raise APIError(422, "MCQ_INCOMPLETE", "Answer every question exactly once.",
                           {"missing": sorted(expected - set(body.answers)), "unknown": sorted(set(body.answers) - expected)})
        per_question = []
        wrong_concepts: list[str] = []
        for qid in mission.mcq.questionIds:
            q = bank[qid]
            chosen = body.answers[qid]
            if chosen not in {o.id for o in q.options}:
                raise APIError(422, "MCQ_INVALID_OPTION", "An answer refers to an option that does not exist.", {"question": qid})
            ok = chosen == q.correct
            if not ok and q.concept not in wrong_concepts:
                wrong_concepts.append(q.concept)
            per_question.append({"id": qid, "chosen": chosen, "correct": q.correct, "isCorrect": ok, "explanationKey": q.explanationKey,
                                 "concept": q.concept, "stemKey": q.stemKey, "options": [o.model_dump() for o in q.options],
                                 "referenceIds": q.referenceIds})
        n_correct = sum(1 for p in per_question if p["isCorrect"])
        total = len(per_question)
        mcq_passed = n_correct / total >= mission.mcq.passFraction
        mission_passed = result["outcome"] in PASSING_OUTCOMES
        concepts = list(dict.fromkeys(result.get("missedConcepts", []) + wrong_concepts))
        criteria_met = mission_passed and mcq_passed
        order = mission.variantPolicy.order
        learning = {
            "missionPassed": mission_passed, "mcqPassed": mcq_passed, "criteriaMet": criteria_met,
            "conceptsToReview": concepts,
            "remediation": None if criteria_met and not concepts else {
                "missionId": mission.id, "nextVariant": order[(row["retry_count"] + 1) % len(order)],
                "suggestPip": result.get("pathway") != "pip" and not criteria_met,
            },
            "progressionEligible": criteria_met,
        }
        out = {"correct": n_correct, "total": total, "passed": mcq_passed, "questions": per_question, "learning": learning}
        now = time.time()
        conn.execute(
            "INSERT INTO mcq_responses (session_id, user_id, answers, correct, total, passed, result, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (session_id, user.id, json.dumps(body.answers), n_correct, total, int(mcq_passed), json.dumps(out), now),
        )
        result["learning"] = learning
        result["mcq"] = {"correct": n_correct, "total": total, "passed": mcq_passed}
        conn.execute("UPDATE mission_sessions SET result = ? WHERE id = ?", (json.dumps(result), session_id))
        conn.execute(
            "UPDATE progress SET best_mcq = MAX(COALESCE(best_mcq, 0), ?), learning_met = MAX(learning_met, ?), passed = MAX(passed, ?), "
            "updated_at = ? WHERE user_id = ? AND mission_id = ?",
            (n_correct, int(criteria_met), int(criteria_met), now, user.id, row["mission_id"]),
        )
        _server_event(conn, session_id, "mcq_submitted", {"correct": n_correct, "total": total})
        _server_event(conn, session_id, "training_result_saved", {"criteriaMet": criteria_met})
    return out
