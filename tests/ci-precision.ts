import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Decimal } from "decimal.js";
import { welchTwoSampleTTest, welchTwoSampleTTestWithCi } from "../reference/stats-kernel/src/kernel.js";
import { studentTQuantile } from "../reference/stats-kernel/src/t-distribution.js";
import { preciseWelchInterval } from "../reference/stats-kernel/src/precise-ci.js";

const fixture = JSON.parse(readFileSync(new URL("./ci-reference.json", import.meta.url), "utf8"));
let checked = 0;
for (const row of fixture.rows) {
  const a = { group_id: "A", values: row.a }, b = { group_id: "B", values: row.b };
  const actual = welchTwoSampleTTestWithCi(a, b, 0.95);
  const refined = row.expected_refinement !== false;
  const base = welchTwoSampleTTest(a, b);
  const q = studentTQuantile(1 - (1 - 0.95) / 2, base.degrees_of_freedom);
  const width = q * base.standard_error;
  const lower = base.mean_difference - width, upper = base.mean_difference + width;
  const ratio = Math.min(Math.abs(lower), Math.abs(upper)) / Math.max(Math.abs(base.mean_difference), Math.abs(width));
  assert.equal(ratio < 1e-4, refined, `${row.name}: trigger band`);
  for (const field of ["lower", "upper", "critical"] as const) {
    const key = field === "critical" ? "critical_value" : field;
    const expected = Number(row.expected[field]);
    const tolerance = refined ? 2 * Number.EPSILON * Math.abs(expected)
      : Math.max(1e-12, 1e-10 * Math.abs(expected));
    assert.ok(Math.abs(actual.confidence_interval[key] - expected) <= tolerance, `${row.name}: ${field}`);
  }
  if (refined) {
    assert.equal(actual.degrees_of_freedom, Number(row.expected.df), `${row.name}: df`);
  } else {
    assert.equal(actual.confidence_interval.lower, lower, `${row.name}: normal lower`);
    assert.equal(actual.confidence_interval.upper, upper, `${row.name}: normal upper`);
    assert.ok(Math.abs(actual.degrees_of_freedom - Number(row.expected.df)) <= 1e-12 * Math.abs(Number(row.expected.df)), `${row.name}: df`);
  }
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
