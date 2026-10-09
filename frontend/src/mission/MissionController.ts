// Runs the client engine for instant feedback and streams every event to the
// server, which re-validates it and remains authoritative for scoring.
import { ApiError, post } from "../api/client";
import type { EventsResponse, SessionInfo, StoredEvent } from "../api/types";
import { apply, currentStep, newState, remainingRequired, TERMINAL, type ApplyResult, type EngineContext, type EngineState, type MissionState } from "./engine";
import type { EventType, GameEvent, MissionDef } from "./types";

export interface EmitRecord {
  event: GameEvent;
  result: ApplyResult;
}

type Listener = (rec: EmitRecord) => void;

export class MissionController {
  st: EngineState;
  readonly ctx: EngineContext;
  private seq: number;
  private queue: GameEvent[] = [];
  private sending = false;
  private retryTimer: number | null = null;
  private retryDelay = 1000;
  private listeners = new Set<Listener>();
  private syncListeners = new Set<(online: boolean, pending: number) => void>();
  private terminalWaiters: ((s: SessionInfo) => void)[] = [];
  serverSession: SessionInfo;
  online = true;
  disposed = false;

  constructor(readonly mission: MissionDef, session: SessionInfo, history: StoredEvent[]) {
    this.serverSession = session;
    this.ctx = { pathway: session.pathway, hintBudget: session.hintBudget };
    this.st = newState();
    this.st.state = "BRIEFING";
    // Rebuild the local engine by replaying the server's event log (refresh recovery).
    for (const e of history) {
      apply(this.mission, this.st, { seq: e.seq, type: e.type as EventType, target: e.target, value: e.value }, this.ctx);
    }
    this.seq = Math.max(session.lastSeq, this.st.lastSeq);
    if (this.st.state !== session.state && !(TERMINAL.has(this.st.state) && session.state === "ASSESSED")) {
      // Defensive: if replay diverges, trust the server snapshot.
      this.st = structuredClone(session.engine);
    }
  }

  get state(): MissionState {
    return this.st.state;
  }

  get terminal(): boolean {
    return TERMINAL.has(this.st.state);
  }

  get pending(): number {
    return this.queue.length;
  }

  current() {
    return currentStep(this.mission, this.st, this.ctx);
  }

  remaining(): string[] {
    return remainingRequired(this.mission, this.st, this.ctx);
  }

  isDone(stepId: string): boolean {
    return this.st.completed.includes(stepId);
  }

  onEmit(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onSync(fn: (online: boolean, pending: number) => void): () => void {
    this.syncListeners.add(fn);
    return () => this.syncListeners.delete(fn);
  }

  /** Apply locally, queue for the server, notify listeners. */
  emit(type: EventType, target: string | null = null, value: string | null = null): ApplyResult {
    if (this.disposed) return { outcome: "rejected", reason: "disposed" };
    if (this.terminal) return { outcome: "rejected", reason: "terminal" };
    const event: GameEvent = { seq: ++this.seq, type, target, value };
    const result = apply(this.mission, this.st, event, this.ctx);
    this.queue.push(event);
    void this.flush();
    this.listeners.forEach((fn) => fn({ event, result }));
    return result;
  }

  async flush(): Promise<void> {
    if (this.sending || !this.queue.length || this.disposed) return;
    this.sending = true;
    const batch = this.queue.slice(0, 50);
    try {
      const res = await post<EventsResponse>(`/sessions/${this.serverSession.id}/events`, {
        events: batch.map((e) => ({ seq: e.seq, type: e.type, target: e.target ?? null, value: e.value ?? null, clientTs: Date.now() / 1000 })),
      });
      this.queue.splice(0, batch.length);
      this.serverSession = res.session;
      this.online = true;
      this.retryDelay = 1000;
      for (const r of res.results) {
        const local = batch.find((b) => b.seq === r.seq);
        if (local && !r.accepted && r.detail.reason !== "terminal") console.warn("Server rejected event", local, r.detail);
      }
      // Server state is authoritative; resynchronise if the engines ever disagree.
      if (res.session.state !== "ASSESSED" && res.session.engine.state !== this.st.state && !this.queue.length) {
        console.warn("Resynchronising mission state from server", res.session.engine.state, this.st.state);
        this.st = structuredClone(res.session.engine);
      }
      if (res.session.state === "ASSESSED") {
        this.queue = [];
        this.terminalWaiters.splice(0).forEach((fn) => fn(res.session));
      }
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
        // Non-retryable (e.g. stale session): drop the batch so we do not loop forever.
        console.error("Event batch rejected", e);
        this.queue.splice(0, batch.length);
      } else {
        this.online = false;
        this.scheduleRetry();
      }
    } finally {
      this.sending = false;
      this.syncListeners.forEach((fn) => fn(this.online, this.queue.length));
    }
    if (this.queue.length && this.online) void this.flush();
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null || this.disposed) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, this.retryDelay);
    this.retryDelay = Math.min(15000, this.retryDelay * 2);
  }

  /** Resolves once the server has assessed the session (after the final event syncs). */
  waitForAssessment(): Promise<SessionInfo> {
    if (this.serverSession.state === "ASSESSED") return Promise.resolve(this.serverSession);
    return new Promise((resolve) => {
      this.terminalWaiters.push(resolve);
      void this.flush();
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.listeners.clear();
    this.syncListeners.clear();
  }
}
