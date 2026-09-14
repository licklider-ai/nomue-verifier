/**
 * Non-authoritative paired-t feasibility spike.
 *
 * This module exercises explicit pair construction and the algebraic quantities
 * that precede Student-t tail/quantile evaluation. It intentionally does not
 * compute a p-value, confidence interval, support limit, or comparison tolerance.
 * Those belong to a later versioned Public Check and independent oracle record.
 */

export type RepeatedMeasurementsDeclaration = "none" | "within_pair_only";

export interface PairedObservationSpike {
  observationId: string;
  experimentalUnitId: string;
  pairId: string;
  conditionId: string;
  outcomeValue: number;
}

export interface PairedTSpikeInput {
  conditionOrder: readonly [string, string];
  repeatedMeasurements: RepeatedMeasurementsDeclaration;
  observations: readonly PairedObservationSpike[];
}

export type PairedTSpikeErrorCode =
  | "INVALID_CONDITION_ORDER"
  | "INVALID_REPEATED_MEASUREMENTS_DECLARATION"
  | "DUPLICATE_OBSERVATION_ID"
  | "NON_FINITE_OUTCOME"
  | "UNKNOWN_CONDITION"
  | "INCOMPLETE_PAIR"
  | "DUPLICATE_PAIR_CONDITION"
  | "EXPERIMENTAL_UNIT_DECLARATION_MISMATCH"
  | "EXPERIMENTAL_UNIT_REUSED_ACROSS_PAIRS"
  | "PAIR_COUNT_BELOW_TWO"
  | "ZERO_DIFFERENCE_VARIANCE"
  | "DIFFERENCE_OVERFLOW"
  | "DIFFERENCE_VARIANCE_ERASED_BY_ROUNDING"
  | "MEAN_ACCUMULATION_OVERFLOW"
  | "CENTERING_OVERFLOW"
  | "SQUARED_DEVIATION_OVERFLOW"
  | "VARIANCE_ACCUMULATION_OVERFLOW"
  | "VARIANCE_UNDERFLOW"
  | "STANDARD_ERROR_SQUARED_UNDERFLOW"
  | "NON_FINITE_INTERMEDIATE";

export interface PairedTSpikeResult {
  operationGraph: "g4-pairwise-two-pass-candidate";
  sqrtReproducibility: "native-sqrt-no-cross-runtime-bit-identity-claim";
  pairIds: string[];
  differences: number[];
  nPairs: number;
  meanDifference: number;
  sampleVarianceDifference: number;
  standardError: number;
  testStatistic: number;
  degreesOfFreedom: number;
}

export type PairedTSpikeOutcome =
  | { ok: true; result: PairedTSpikeResult }
  | { ok: false; error: PairedTSpikeErrorCode; pairId?: string; observationId?: string };

interface PairMembers {
  first?: PairedObservationSpike;
  second?: PairedObservationSpike;
}

interface ExactDyadic {
  numerator: bigint;
  denominatorExponent: number;
}

function normalizeDyadic(value: ExactDyadic): ExactDyadic {
  let { numerator, denominatorExponent } = value;
  if (numerator === 0n) return { numerator: 0n, denominatorExponent: 0 };
  while (denominatorExponent > 0 && (numerator & 1n) === 0n) {
    numerator >>= 1n;
    denominatorExponent -= 1;
  }
  return { numerator, denominatorExponent };
}

/** Lift one finite binary64 value to its exact dyadic-rational value. */
export function binary64ToExactDyadic(value: number): ExactDyadic {
  if (!Number.isFinite(value)) throw new RangeError("value must be finite binary64");
  if (value === 0) return { numerator: 0n, denominatorExponent: 0 };

  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, false);
  const high = view.getUint32(0, false);
  const low = view.getUint32(4, false);
  const negative = high >>> 31 === 1;
  const exponentBits = (high >>> 20) & 0x7ff;
  const fractionBits = (BigInt(high & 0x000f_ffff) << 32n) | BigInt(low);

  let significand: bigint;
  let binaryExponent: number;
  if (exponentBits === 0) {
    significand = fractionBits;
    binaryExponent = -1074;
  } else {
    significand = (1n << 52n) | fractionBits;
    binaryExponent = exponentBits - 1023 - 52;
  }
  if (negative) significand = -significand;
  return binaryExponent >= 0
    ? { numerator: significand << BigInt(binaryExponent), denominatorExponent: 0 }
    : normalizeDyadic({ numerator: significand, denominatorExponent: -binaryExponent });
}

function subtractDyadics(first: ExactDyadic, second: ExactDyadic): ExactDyadic {
  const denominatorExponent = Math.max(first.denominatorExponent, second.denominatorExponent);
  const firstNumerator = first.numerator << BigInt(denominatorExponent - first.denominatorExponent);
  const secondNumerator =
    second.numerator << BigInt(denominatorExponent - second.denominatorExponent);
  return normalizeDyadic({
    numerator: firstNumerator - secondNumerator,
    denominatorExponent,
  });
}

function dyadicsEqual(first: ExactDyadic, second: ExactDyadic): boolean {
  return (
    first.numerator === second.numerator && first.denominatorExponent === second.denominatorExponent
  );
}

/** Fixed recursive floor(n/2) split reduction used by the G4 candidate graph. */
export function pairwiseSum(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sumRange = (start: number, end: number): number => {
    if (end - start === 1) {
      const value = values[start];
      if (value === undefined) throw new Error("pairwise reduction lost its leaf operand");
      return value;
    }
    const middle = start + Math.floor((end - start) / 2);
    return sumRange(start, middle) + sumRange(middle, end);
  };

  return sumRange(0, values.length);
}

function fail(
  error: PairedTSpikeErrorCode,
  detail: { pairId?: string; observationId?: string } = {},
): PairedTSpikeOutcome {
  return { ok: false, error, ...detail };
}

/** Run the deliberately incomplete paired-t feasibility path. */
export function computePairedTSpike(input: PairedTSpikeInput): PairedTSpikeOutcome {
  const [firstCondition, secondCondition] = input.conditionOrder;
  if (
    firstCondition.length === 0 ||
    secondCondition.length === 0 ||
    firstCondition === secondCondition
  ) {
    return fail("INVALID_CONDITION_ORDER");
  }
  if (input.repeatedMeasurements !== "none" && input.repeatedMeasurements !== "within_pair_only") {
    return fail("INVALID_REPEATED_MEASUREMENTS_DECLARATION");
  }

  const observationIds = new Set<string>();
  const experimentalUnitPairs = new Map<string, string>();
  const pairs = new Map<string, PairMembers>();
  for (const observation of input.observations) {
    if (observationIds.has(observation.observationId)) {
      return fail("DUPLICATE_OBSERVATION_ID", { observationId: observation.observationId });
    }
    observationIds.add(observation.observationId);
    if (!Number.isFinite(observation.outcomeValue)) {
      return fail("NON_FINITE_OUTCOME", { observationId: observation.observationId });
    }
    if (observation.conditionId !== firstCondition && observation.conditionId !== secondCondition) {
      return fail("UNKNOWN_CONDITION", {
        pairId: observation.pairId,
        observationId: observation.observationId,
      });
    }
    const existingPairId = experimentalUnitPairs.get(observation.experimentalUnitId);
    if (existingPairId !== undefined && existingPairId !== observation.pairId) {
      return fail("EXPERIMENTAL_UNIT_REUSED_ACROSS_PAIRS", {
        pairId: observation.pairId,
        observationId: observation.observationId,
      });
    }
    experimentalUnitPairs.set(observation.experimentalUnitId, observation.pairId);

    const members = pairs.get(observation.pairId) ?? {};
    const key = observation.conditionId === firstCondition ? "first" : "second";
    if (members[key] !== undefined) {
      return fail("DUPLICATE_PAIR_CONDITION", { pairId: observation.pairId });
    }
    members[key] = observation;
    pairs.set(observation.pairId, members);
  }

  const pairIds = [...pairs.keys()].sort();
  if (pairIds.length < 2) return fail("PAIR_COUNT_BELOW_TWO");

  const differences: number[] = [];
  const exactDifferences: ExactDyadic[] = [];
  for (const pairId of pairIds) {
    const members = pairs.get(pairId);
    if (members?.first === undefined || members.second === undefined) {
      return fail("INCOMPLETE_PAIR", { pairId });
    }
    const sameUnit = members.first.experimentalUnitId === members.second.experimentalUnitId;
    if (
      (input.repeatedMeasurements === "within_pair_only" && !sameUnit) ||
      (input.repeatedMeasurements === "none" && sameUnit)
    ) {
      return fail("EXPERIMENTAL_UNIT_DECLARATION_MISMATCH", { pairId });
    }
    exactDifferences.push(
      subtractDyadics(
        binary64ToExactDyadic(members.first.outcomeValue),
        binary64ToExactDyadic(members.second.outcomeValue),
      ),
    );
    const difference = members.first.outcomeValue - members.second.outcomeValue;
    if (!Number.isFinite(difference)) return fail("DIFFERENCE_OVERFLOW", { pairId });
    differences.push(difference);
  }

  const nPairs = differences.length;
  const firstExactDifference = exactDifferences[0];
  if (
    firstExactDifference !== undefined &&
    exactDifferences.every((value) => dyadicsEqual(value, firstExactDifference))
  ) {
    return fail("ZERO_DIFFERENCE_VARIANCE");
  }
  if (differences.every((value) => value === differences[0])) {
    return fail("DIFFERENCE_VARIANCE_ERASED_BY_ROUNDING");
  }

  const differenceSum = pairwiseSum(differences);
  if (!Number.isFinite(differenceSum)) return fail("MEAN_ACCUMULATION_OVERFLOW");
  const meanDifference = differenceSum / nPairs;
  if (!Number.isFinite(meanDifference)) return fail("NON_FINITE_INTERMEDIATE");

  const centered = differences.map((value) => value - meanDifference);
  if (centered.some((value) => !Number.isFinite(value))) return fail("CENTERING_OVERFLOW");
  const squaredDeviations = centered.map((value) => value * value);
  if (squaredDeviations.some((value) => !Number.isFinite(value))) {
    return fail("SQUARED_DEVIATION_OVERFLOW");
  }
  const centeredSumSquares = pairwiseSum(squaredDeviations);
  if (!Number.isFinite(centeredSumSquares)) {
    return fail("VARIANCE_ACCUMULATION_OVERFLOW");
  }
  const sampleVarianceDifference = centeredSumSquares / (nPairs - 1);
  if (sampleVarianceDifference === 0) return fail("VARIANCE_UNDERFLOW");
  if (!Number.isFinite(sampleVarianceDifference)) return fail("NON_FINITE_INTERMEDIATE");
  const standardErrorSquared = sampleVarianceDifference / nPairs;
  if (standardErrorSquared === 0) return fail("STANDARD_ERROR_SQUARED_UNDERFLOW");
  const standardError = Math.sqrt(standardErrorSquared);
  const testStatistic = meanDifference / standardError;
  if (
    !Number.isFinite(meanDifference) ||
    !Number.isFinite(sampleVarianceDifference) ||
    !Number.isFinite(standardError) ||
    !Number.isFinite(testStatistic)
  ) {
    return fail("NON_FINITE_INTERMEDIATE");
  }

  return {
    ok: true,
    result: {
      operationGraph: "g4-pairwise-two-pass-candidate",
      sqrtReproducibility: "native-sqrt-no-cross-runtime-bit-identity-claim",
      pairIds,
      differences,
      nPairs,
      meanDifference,
      sampleVarianceDifference,
      standardError,
      testStatistic,
      degreesOfFreedom: nPairs - 1,
    },
  };
}
