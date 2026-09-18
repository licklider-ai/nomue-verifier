import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Decimal from "decimal.js";
import { welchTwoSampleTTestWithCi } from "../reference/stats-kernel/src/kernel.js";
import { preciseWelchInterval } from "../reference/stats-kernel/src/precise-ci.js";

const fixture = JSON.parse(readFileSync(new URL("./ci-reference.json", import.meta.url), "utf8"));
let checked = 0;
for (const row of fixture.rows) {
  const a = { group_id: "A", values: row.a }, b = { group_id: "B", values: row.b };
  const actual = welchTwoSampleTTestWithCi(a, b, 0.95);
  for (const field of ["lower", "upper", "critical"] as const) {
    const key = field === "critical" ? "critical_value" : field;
    const expected = Number(row.expected[field]);
    assert.ok(Math.abs(actual.confidence_interval[key] - expected) <= 2 * Number.EPSILON * Math.abs(expected), `${row.name}: ${field}`);
  }
  assert.equal(actual.degrees_of_freedom, Number(row.expected.df), `${row.name}: df`);
  const reversed = welchTwoSampleTTestWithCi(b, a, 0.95);
  assert.equal(reversed.confidence_interval.lower, -actual.confidence_interval.upper);
  assert.equal(reversed.confidence_interval.upper, -actual.confidence_interval.lower);
  const permuted = welchTwoSampleTTestWithCi({ ...a, values: [...a.values].reverse() }, b, 0.95);
  assert.deepEqual(permuted, actual, `${row.name}: observation order`);
  checked++;
}
// Consumer decimal configuration must not change the private arithmetic context.
const row = fixture.rows[0];
Decimal.set({ precision: 4, rounding: Decimal.ROUND_DOWN });
const isolated = preciseWelchInterval(row.a, row.b, 0.95, 2);
assert.equal(isolated.lower, Number(row.expected.lower));
assert.throws(() => preciseWelchInterval([1], [2, 3], .95, 2));
assert.throws(() => preciseWelchInterval([1, 1], [2, 2], .95, 2));
assert.throws(() => preciseWelchInterval([NaN, 1], [2, 3], .95, 2));
assert.throws(() => preciseWelchInterval([1, 2], [2, 3], 1, 2));
console.log(`ci-precision: ${checked} independent reference rows, reversal/permutation and refusal checks OK`);
