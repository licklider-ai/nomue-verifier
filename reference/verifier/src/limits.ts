/**
 * Phase 1 resource limits (EXPERIMENTAL) - NRS-SEC-0003, and the Phase 2A
 * in-process processing-time and memory bounds - NRS-SEC-0006.
 * Exceeding a limit is a safe refusal: no code execution, no partial
 * verification result presented as success.
 */

export const PHASE1_LIMITS = {
  maxRecordBytes: 5 * 1024 * 1024,
  maxNestingDepth: 64,
  maxObservations: 10_000,
  maxStringLength: 16_384,
  /**
   * Rationale (NRS-SEC-0006): verifying a maximum-shape Phase 1/2A input
   * (5 MiB, 10,000 observations, JCS canonicalization, Welch recomputation)
   * measures well under 200ms on ordinary development hardware. 5,000ms is
   * roughly a 25x margin over that measured cost - generous enough to absorb
   * slow CI/dev machines and GC pauses without masking a genuine algorithmic
   * blow-up in a future check, while still bounding worst-case wall-clock
   * exposure instead of leaving it to an external harness. This is an
   * implementation-side engineering choice, not a statistical or scientific
   * one; the value is expected to be revisited with real deployment
   * measurements rather than re-derived analytically.
   */
  maxProcessingMs: 5_000,
  /**
   * Rationale (NRS-SEC-0006): peak heap usage for the same maximum-shape
   * input, measured with `process.memoryUsage().heapUsed`, stays under
   * 20 MiB in practice (parsed JSON tree, canonical-form string, and a
   * bounded number of derived numeric arrays, all proportional to the
   * already-capped 5 MiB / 10,000-observation input). 512 MiB is roughly a
   * 25x margin, chosen for the same reason as the time budget: generous
   * headroom against ordinary variance, while still bounding pathological
   * memory growth (for example an accidental quadratic string-building
   * path) instead of leaving it unbounded. Also an implementation-side
   * choice, not a statistical one.
   */
  maxHeapBytes: 512 * 1024 * 1024,
} as const;

export interface LimitViolation {
  limit: keyof typeof PHASE1_LIMITS;
  message: string;
}

/**
 * A processing budget checked at pipeline checkpoints (NRS-SEC-0006), not
 * preemptively mid-computation: Node.js has no synchronous preemption, so
 * this bounds "no single verification run may cross this wall-clock or heap
 * threshold between checkpoints" rather than truly interrupting a runaway
 * loop. Given the Phase 1/2A size, depth, and observation ceilings already
 * bound the amount of work any single checkpoint segment can do, this is a
 * defense-in-depth check against unexpectedly expensive code paths within
 * those ceilings, not the primary defense against oversized input (that is
 * checkRawSize/checkParsedLimits). `now` and `heapUsed` are injectable so
 * tests can simulate a budget that is already exceeded without actually
 * waiting maxProcessingMs or allocating maxHeapBytes.
 */
export interface ProcessingBudget {
  readonly startedAtMs: number;
  readonly deadlineMs: number;
  readonly maxHeapBytes: number;
  now(): number;
  heapUsedBytes(): number;
}

export function startProcessingBudget(overrides?: {
  now?: () => number;
  heapUsedBytes?: () => number;
  maxProcessingMs?: number;
  maxHeapBytes?: number;
}): ProcessingBudget {
  const now = overrides?.now ?? Date.now;
  const heapUsedBytes = overrides?.heapUsedBytes ?? (() => process.memoryUsage().heapUsed);
  const maxProcessingMs = overrides?.maxProcessingMs ?? PHASE1_LIMITS.maxProcessingMs;
  return {
    startedAtMs: now(),
    deadlineMs: now() + maxProcessingMs,
    maxHeapBytes: overrides?.maxHeapBytes ?? PHASE1_LIMITS.maxHeapBytes,
    now,
    heapUsedBytes,
  };
}

/**
 * Checked at pipeline checkpoints between verifyInner's phases. Calls
 * `now()` and `heapUsedBytes()` exactly once each, so an injected stateful
 * mock advances predictably per checkpoint call.
 */
export function checkProcessingBudget(budget: ProcessingBudget): LimitViolation | null {
  const now = budget.now();
  if (now > budget.deadlineMs) {
    return {
      limit: "maxProcessingMs",
      message: `processing exceeded ${budget.deadlineMs - budget.startedAtMs}ms (elapsed ${now - budget.startedAtMs}ms)`,
    };
  }
  const heapUsedBytes = budget.heapUsedBytes();
  if (heapUsedBytes > budget.maxHeapBytes) {
    return {
      limit: "maxHeapBytes",
      message: `heap usage ${heapUsedBytes} bytes exceeded the limit of ${budget.maxHeapBytes} bytes`,
    };
  }
  return null;
}

export function checkRawSize(byteLength: number): LimitViolation | null {
  if (byteLength > PHASE1_LIMITS.maxRecordBytes) {
    return {
      limit: "maxRecordBytes",
      message: `input is ${byteLength} bytes; the Phase 1 limit is ${PHASE1_LIMITS.maxRecordBytes}`,
    };
  }
  return null;
}

/**
 * Iterative traversal (no recursion, so a hostile deep input cannot overflow
 * the checker itself) enforcing nesting depth and per-string length.
 */
export function checkParsedLimits(value: unknown): LimitViolation[] {
  const violations: LimitViolation[] = [];
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 1 }];
  let deepest = 0;
  let stringTooLong = false;

  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const { node, depth } = item;
    if (depth > deepest) deepest = depth;
    if (deepest > PHASE1_LIMITS.maxNestingDepth) break;

    if (typeof node === "string") {
      if (node.length > PHASE1_LIMITS.maxStringLength) stringTooLong = true;
      continue;
    }
    if (node === null || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      for (const child of node) stack.push({ node: child, depth: depth + 1 });
      continue;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (key.length > PHASE1_LIMITS.maxStringLength) stringTooLong = true;
      stack.push({ node: child, depth: depth + 1 });
    }
  }

  if (deepest > PHASE1_LIMITS.maxNestingDepth) {
    violations.push({
      limit: "maxNestingDepth",
      message: `nesting depth exceeds the Phase 1 limit of ${PHASE1_LIMITS.maxNestingDepth}`,
    });
  }
  if (stringTooLong) {
    violations.push({
      limit: "maxStringLength",
      message: `a string exceeds ${PHASE1_LIMITS.maxStringLength} UTF-16 code units`,
    });
  }

  const observations =
    (value as { payload?: { dataset?: { observations?: unknown } } } | null)?.payload?.dataset
      ?.observations ?? null;
  if (Array.isArray(observations) && observations.length > PHASE1_LIMITS.maxObservations) {
    violations.push({
      limit: "maxObservations",
      message: `observation count ${observations.length} exceeds the Phase 1 limit of ${PHASE1_LIMITS.maxObservations}`,
    });
  }

  return violations;
}
