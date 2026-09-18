/** Unissued graph component; inputs are trusted local evaluations, not evidence. */
export const STAGES = Object.freeze([
  "S",
  "K",
  "D",
  "H",
  "I",
  "C",
  "A",
] as const);
export type Stage = (typeof STAGES)[number];
export const DEPENDS: Readonly<Record<Stage, readonly Stage[]>> = Object.freeze(
  {
    S: Object.freeze([]),
    K: Object.freeze(["S"] as Stage[]),
    D: Object.freeze(["S"] as Stage[]),
    H: Object.freeze(["D"] as Stage[]),
    I: Object.freeze(["S", "K"] as Stage[]),
    C: Object.freeze(["S"] as Stage[]),
    A: Object.freeze(["K", "D", "H", "I", "C"] as Stage[]),
  },
);
export const CHECK_IDS: Readonly<Record<Stage, string>> = Object.freeze(
  Object.fromEntries(
    STAGES.map((stage) => [stage, `candidate:holm:d1:${stage}`]),
  ) as Record<Stage, string>,
);

export type Evaluation =
  | { execution: "completed"; outcome: "pass" | "fail"; reasons: string[] }
  | { execution: "error"; reasons: string[] };
export type Row = { stage: Stage; checkId: string; blockers: string[] } & (
  Evaluation | { execution: "not_run"; reasons: string[] }
);

export class GraphInvariantError extends Error {
  readonly kind = "internal_error";
  constructor(message: string) {
    super(message);
    this.name = "GraphInvariantError";
  }
}

function evaluation(stage: Stage, item: unknown): Evaluation {
  if (item === null || typeof item !== "object" || Array.isArray(item))
    throw new GraphInvariantError(`missing evaluation ${stage}`);
  const v = item as Record<string, unknown>;
  const completed = v.execution === "completed";
  if (!completed && !(stage === "C" && v.execution === "error"))
    throw new GraphInvariantError(`invalid execution ${stage}`);
  const keys = completed
    ? ["execution", "outcome", "reasons"]
    : ["execution", "reasons"];
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(v, key))
  )
    throw new GraphInvariantError(`invalid fields ${stage}`);
  if (completed && v.outcome !== "pass" && v.outcome !== "fail")
    throw new GraphInvariantError(`invalid outcome ${stage}`);
  if (
    !Array.isArray(v.reasons) ||
    v.reasons.some(
      (r) =>
        typeof r !== "string" ||
        !/^candidate:holm:[a-z][a-z0-9_]*$/.test(r) ||
        r === "candidate:holm:prerequisite_failed" ||
        r.length > 256,
    ) ||
    new Set(v.reasons).size !== v.reasons.length
  )
    throw new GraphInvariantError(`invalid reasons ${stage}`);
  if ((completed && v.outcome === "pass") !== (v.reasons.length === 0))
    throw new GraphInvariantError(`outcome reasons ${stage}`);
  // Copy, so later caller mutation cannot change a completed graph row.
  return completed
    ? {
        execution: "completed",
        outcome: v.outcome as "pass" | "fail",
        reasons: [...v.reasons],
      }
    : { execution: "error", reasons: [...v.reasons] };
}

const passed = (row: Row) =>
  row.execution === "completed" && row.outcome === "pass";

/** Reject evaluations for blocked stages; never silently discard impossible passes. */
export function assembleResults(
  evaluations: Partial<Record<Stage, Evaluation>>,
): Row[] {
  if (
    evaluations === null ||
    typeof evaluations !== "object" ||
    Array.isArray(evaluations) ||
    Object.keys(evaluations).some((key) => !STAGES.includes(key as Stage))
  )
    throw new GraphInvariantError("invalid evaluation map");
  const rows: Row[] = [];
  const byStage = new Map<Stage, Row>();
  for (const stage of STAGES) {
    const blocking = DEPENDS[stage]
      .map((dep) => byStage.get(dep)!)
      .filter((row) => !passed(row));
    let row: Row;
    if (blocking.length) {
      if (Object.hasOwn(evaluations, stage))
        throw new GraphInvariantError(`evaluation of blocked stage ${stage}`);
      const reasons = [...new Set(blocking.flatMap((item) => item.reasons))];
      row = {
        stage,
        checkId: CHECK_IDS[stage],
        execution: "not_run",
        reasons,
        blockers: blocking.map((item) => item.checkId),
      };
    } else {
      if (!Object.hasOwn(evaluations, stage))
        throw new GraphInvariantError(`missing evaluation ${stage}`);
      row = {
        stage,
        checkId: CHECK_IDS[stage],
        ...evaluation(stage, evaluations[stage]),
        blockers: [],
      };
    }
    rows.push(row);
    byStage.set(stage, row);
  }
  return rows;
}

/** Validate serialized internal rows against the fixed graph, including reason content/order. */
export function validateResults(value: unknown): asserts value is Row[] {
  if (!Array.isArray(value) || value.length !== STAGES.length)
    throw new GraphInvariantError("invalid row count");
  const evaluated: Partial<Record<Stage, Evaluation>> = {};
  value.forEach((row: unknown, i) => {
    if (row === null || typeof row !== "object" || Array.isArray(row))
      throw new GraphInvariantError("invalid row");
    const r = row as Record<string, unknown>;
    const stage = STAGES[i]!;
    if (r.stage !== stage || r.checkId !== CHECK_IDS[stage])
      throw new GraphInvariantError("invalid row identity/order");
    const keys =
      r.execution === "completed"
        ? ["stage", "checkId", "execution", "outcome", "reasons", "blockers"]
        : ["stage", "checkId", "execution", "reasons", "blockers"];
    if (
      Object.keys(r).length !== keys.length ||
      keys.some((k) => !Object.hasOwn(r, k))
    )
      throw new GraphInvariantError("invalid row fields");
    if (r.execution !== "not_run") {
      const v =
        r.execution === "completed"
          ? { execution: r.execution, outcome: r.outcome, reasons: r.reasons }
          : { execution: r.execution, reasons: r.reasons };
      evaluated[stage] = evaluation(stage, v);
    }
  });
  const expected = assembleResults(evaluated);
  value.forEach((row: Row, i) => {
    const e = expected[i]!;
    if (
      row.execution !== e.execution ||
      !Array.isArray(row.reasons) ||
      !Array.isArray(row.blockers) ||
      JSON.stringify(row.reasons) !== JSON.stringify(e.reasons) ||
      JSON.stringify(row.blockers) !== JSON.stringify(e.blockers)
    )
      throw new GraphInvariantError("inconsistent dependency result");
  });
}
