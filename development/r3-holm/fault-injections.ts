/** Fixed trusted test mutations. Never imported by the normal invocation entry. */
import { type InnerHarness } from "./inner-call.ts";
import { createBudget, InvocationError } from "./execution.ts";
import { validateWire } from "./output.ts";

export const FAULTS = Object.freeze([
  "fault-a-pass",
  "fault-s-pass",
  "fault-swap",
  "fault-duplicate",
  "fault-omit",
  "fault-error-outcome",
  "fault-notrun-outcome",
  "fault-generic-reason",
  "fault-missing-blocker",
  "fault-unrelated-blocker",
  "fault-missing-reason",
  "fault-late-budget",
  "fault-schema-budget",
  "fault-worker-output",
] as const);
export type Fault = (typeof FAULTS)[number];
export function faultHarness(
  mode: Fault,
  runner?: InnerHarness["runner"],
): InnerHarness {
  if (!(FAULTS as readonly string[]).includes(mode))
    throw Error("unknown fixed fault");
  const real = createBudget();
  let late = false;
  return {
    runner:
      mode === "fault-worker-output" ? async () => Buffer.from("{}") : runner,
    budget: {
      checkpoint() {
        real.checkpoint();
        if (late)
          throw new InvocationError("resource_limit", "processing_timeout");
      },
      remainingMs: () => real.remainingMs(),
    },
    beforeValidate(o) {
      const a = o.verification[2],
        c = o.verification[1];
      switch (mode) {
        case "fault-a-pass":
          a.execution = "completed";
          a.outcome = "pass";
          a.reasons = [];
          a.blockers = [];
          break;
        case "fault-s-pass":
          // A graph-consistent lie: only private evidence, not schema/graph shape, can reject it.
          for (const row of [...o.conformance, ...o.verification]) {
            row.execution = "completed";
            row.outcome = "pass";
            row.reasons = [];
            row.blockers = [];
            if (["H", "A"].includes(row.stage))
              row.scope = {
                kind: "selected_holm",
                analysis_id: "a-0",
                family_id: "f-0",
                result_id: "r-0",
              };
          }
          validateWire(o);
          break;
        case "fault-swap":
          [o.conformance[0], o.verification[0]] = [
            o.verification[0],
            o.conformance[0],
          ];
          break;
        case "fault-duplicate":
          o.conformance[1] = structuredClone(o.conformance[0]);
          break;
        case "fault-omit":
          o.verification.pop();
          break;
        case "fault-error-outcome":
          c.outcome = "pass";
          break;
        case "fault-notrun-outcome":
          a.outcome = "pass";
          break;
        case "fault-generic-reason":
          a.reasons = ["candidate:holm:prerequisite_failed"];
          break;
        case "fault-missing-blocker":
          a.blockers = [];
          break;
        case "fault-unrelated-blocker":
          a.blockers = [o.conformance[0].check_id];
          break;
        case "fault-missing-reason":
          a.reasons = [];
          break;
        case "fault-late-budget":
        case "fault-schema-budget":
          late = true;
          break;
      }
    },
  };
}
