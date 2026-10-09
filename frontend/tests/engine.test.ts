import { describe, expect, it } from "vitest";
import vectors from "../../shared/test-vectors/silent-pump.json";
import missionJson from "../../shared/missions/og-hazrec-l1-silent-pump.json";
import { apply, currentStep, newState, start, TransitionError, transition, type EngineContext } from "../src/mission/engine";
import type { GameEvent, MissionDef } from "../src/mission/types";

const mission = missionJson as unknown as MissionDef;

interface VectorEvent { type: string; target?: string; value?: string; seq?: number; expect: string; [k: string]: unknown }
interface VectorCase { name: string; context: EngineContext; events: VectorEvent[]; final: { state: string; completed?: string[]; flags?: string[]; counters?: Record<string, number> } }

describe("engine parity with shared vectors", () => {
  for (const c of (vectors as { cases: VectorCase[] }).cases) {
    it(c.name, () => {
      const st = newState();
      start(st);
      let seq = 0;
      for (const ev of c.events) {
        seq = ev.seq ?? seq + 1;
        const event: GameEvent = { seq, type: ev.type as GameEvent["type"], target: ev.target ?? null, value: ev.value ?? null };
        const res = apply(mission, st, event, c.context);
        expect(res.outcome, JSON.stringify(ev)).toBe(ev.expect);
        for (const key of ["reason", "missing", "ruleId", "steps"] as const) {
          if (key in ev) expect((res as unknown as Record<string, unknown>)[key]).toEqual(ev[key]);
        }
      }
      expect(st.state).toBe(c.final.state);
      if (c.final.completed) expect(st.completed).toEqual(c.final.completed);
      if (c.final.flags) expect(st.flags).toEqual(c.final.flags);
      for (const [k, v] of Object.entries(c.final.counters ?? {})) expect(st.counters[k as keyof typeof st.counters], k).toBe(v);
    });
  }
});

describe("state machine", () => {
  it("rejects illegal transitions", () => {
    const st = newState();
    expect(() => transition(st, "ASSESSED")).toThrow(TransitionError);
    start(st);
    expect(() => start(st)).toThrow(TransitionError);
  });

  it("current step advances with progress", () => {
    const st = newState();
    start(st);
    const ctx = { pathway: "standard" as const, hintBudget: 99 };
    expect(currentStep(mission, st, ctx)?.id).toBe("arrive");
    apply(mission, st, { seq: 1, type: "zone_entered", target: "zone_briefing" }, ctx);
    expect(currentStep(mission, st, ctx)?.id).toBe("meet_supervisor");
  });
});
