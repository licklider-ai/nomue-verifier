/** Guard-digit evaluation of the same Welch CI when endpoint subtraction cancels.
 * This is an implementation repair, not a tolerance or supported-method change.
 * No independently certified error enclosure is claimed.
 */
import { Decimal } from "decimal.js";

// Private context: consumers changing Decimal's defaults cannot change this path.
const D = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_EVEN });
const ONE = new D(1);
const HALF = new D("0.5");
const EPS = new D("1e-55");
const PI = D.acos(-1);
const LOG_TWO_PI = PI.times(2).ln();
// B_(2k) / (2k(2k-1)), k=1..20, exact rational Stirling coefficients.
const STIRLING = [
  ["1", "12"], ["-1", "360"], ["1", "1260"], ["-1", "1680"],
  ["1", "1188"], ["-691", "360360"], ["1", "156"], ["-3617", "122400"],
  ["43867", "244188"], ["-174611", "125400"], ["77683", "5796"],
  ["-236364091", "1506960"], ["657931", "300"], ["-3392780147", "93960"],
  ["1723168255201", "2492028"], ["-7709321041217", "505920"],
  ["151628697551", "396"], ["-26315271553053477373", "2418179400"],
  ["154210205991661", "444"], ["-261082718496449122051", "21106800"],
].map(([n, d]) => new D(n).div(d));

/** Preserve binary64 input semantics instead of reinterpreting display decimals. */
function binary64(x: number): Decimal {
  if (!Number.isFinite(x)) throw new RangeError("non-finite CI input");
  if (x === 0) return new D(0);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const e = Number((bits >> 52n) & 0x7ffn);
  const m = (bits & ((1n << 52n) - 1n)) + (e === 0 ? 0n : 1n << 52n);
  return new D(m.toString()).times(new D(2).pow(e === 0 ? -1074 : e - 1075))
    .times(x < 0 ? -1 : 1);
}

function moments(values: readonly number[]): { mean: Decimal; variance: Decimal } {
  if (values.length < 2) throw new RangeError("insufficient CI observations");
  const xs = values.map(binary64);
  // Center first: preserve small differences in large-location data.
  const origin = xs[0];
  const offsets = xs.map(x => x.minus(origin));
  const center = offsets.reduce((a, b) => a.plus(b), new D(0)).div(xs.length);
  const variance = offsets.reduce((a, x) => a.plus(x.minus(center).pow(2)), new D(0))
    .div(xs.length - 1);
  return { mean: origin.plus(center), variance };
}

function logGamma(x: Decimal): Decimal {
  let z = x;
  let shift = new D(0);
  while (z.lt(128)) {
    shift = shift.plus(z.ln());
    z = z.plus(1);
  }
  const inv = ONE.div(z);
  const inv2 = inv.times(inv);
  let power = inv;
  let correction = new D(0);
  for (const coefficient of STIRLING) {
    correction = correction.plus(coefficient.times(power));
    power = power.times(inv2);
  }
  return z.minus(HALF).times(z.ln()).minus(z).plus(LOG_TWO_PI.div(2))
    .plus(correction).minus(shift);
}

// Incomplete beta continued fraction; each loop is bounded. A failed refinement
// throws rather than returning the old cancellation-prone endpoint as success.
function betaFraction(a: Decimal, b: Decimal, x: Decimal): Decimal {
  const tiny = new D("1e-75");
  const nonzero = (v: Decimal) => v.abs().lt(tiny) ? (v.isNeg() ? tiny.neg() : tiny) : v;
  let c = ONE;
  let d = ONE.div(nonzero(ONE.minus(a.plus(b).times(x).div(a.plus(1)))));
  let h = d;
  for (let m = 1; m <= 512; m++) {
    const twice = 2 * m;
    let aa = b.minus(m).times(m).times(x).div(a.plus(twice - 1).times(a.plus(twice)));
    d = ONE.div(nonzero(ONE.plus(aa.times(d))));
    c = nonzero(ONE.plus(aa.div(c)));
    h = h.times(d).times(c);
    aa = a.plus(m).times(a.plus(b).plus(m)).times(x).neg()
      .div(a.plus(twice).times(a.plus(twice + 1)));
    d = ONE.div(nonzero(ONE.plus(aa.times(d))));
    c = nonzero(ONE.plus(aa.div(c)));
    const delta = d.times(c);
    h = h.times(delta);
    if (delta.minus(1).abs().lte(EPS)) return h;
  }
  throw new RangeError("CI beta refinement did not converge");
}

function quantile(df: Decimal, level: number, seed: number): Decimal {
  const a = df.div(2);
  const logBeta = logGamma(a).plus(logGamma(HALF)).minus(logGamma(a.plus(HALF)));
  // Confidence levels are declared decimal probabilities (Release 1: 0.95).
  const tail = ONE.minus(new D(String(level))).div(2);
  const sf = (q: Decimal): Decimal => {
    if (q.isZero()) return HALF;
    const x = df.div(df.plus(q.times(q)));
    const y = ONE.minus(x);
    const factor = a.times(x.ln()).plus(HALF.times(y.ln())).minus(logBeta).exp();
    const beta = x.lt(a.plus(1).div(a.plus(HALF).plus(2)))
      ? factor.times(betaFraction(a, HALF, x)).div(a)
      : ONE.minus(factor.times(betaFraction(HALF, a, y)).div(HALF));
    return beta.div(2);
  };
  let lo = new D(0);
  let hi = new D(Math.max(1, Math.abs(seed) * 2));
  let bracketed = false;
  for (let i = 0; i < 64; i++) {
    if (sf(hi).lte(tail)) { bracketed = true; break; }
    hi = hi.times(2);
  }
  if (!bracketed) throw new RangeError("CI quantile not bracketed");
  let q = new D(Math.abs(seed));
  if (q.lte(lo) || q.gte(hi)) q = lo.plus(hi).div(2);
  const logDensityScale = logBeta.neg().minus(df.ln().div(2));
  for (let i = 0; i < 128; i++) {
    const residual = sf(q).minus(tail);
    if (residual.abs().lte(tail.times("1e-45"))) return q;
    if (residual.gt(0)) lo = q; else hi = q;
    const density = logDensityScale.minus(df.plus(1).div(2)
      .times(ONE.plus(q.times(q).div(df)).ln())).exp();
    const candidate = q.plus(residual.div(density));
    q = candidate.gt(lo) && candidate.lt(hi) ? candidate : lo.plus(hi).div(2);
  }
  throw new RangeError("CI quantile refinement did not converge");
}

export function preciseWelchInterval(
  first: readonly number[], second: readonly number[], level: number, seed: number,
) {
  if (!Number.isFinite(level) || level <= 0 || level >= 1 || !Number.isFinite(seed)) {
    throw new RangeError("invalid CI refinement parameters");
  }
  const m1 = moments(first), m2 = moments(second);
  const a = m1.variance.div(first.length), b = m2.variance.div(second.length);
  const se = a.plus(b).sqrt();
  if (!se.isFinite() || se.lte(0)) throw new RangeError("undefined CI standard error");
  const df = a.plus(b).pow(2).div(a.pow(2).div(first.length - 1).plus(b.pow(2).div(second.length - 1)));
  const q = quantile(df, level, seed);
  const mean = m1.mean.minus(m2.mean);
  const width = q.times(se);
  const result = {
    mean1: m1.mean.toNumber(), variance1: m1.variance.toNumber(),
    mean2: m2.mean.toNumber(), variance2: m2.variance.toNumber(),
    mean: mean.toNumber(), se: se.toNumber(), df: df.toNumber(),
    t: mean.div(se).toNumber(), critical: q.toNumber(),
    lower: mean.minus(width).toNumber(), upper: mean.plus(width).toNumber(),
  };
  if (Object.values(result).some(x => !Number.isFinite(x))) throw new RangeError("non-finite refined CI");
  return result;
}
