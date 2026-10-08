// Run: node --test tdf-calculator/tdf.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const TDF = require("./tdf.js");

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);

test("60 Gy / 30 fx, 5 per week ≈ TDF 99 (Orton–Ellis tables)", () => {
  const tdf = TDF.tdfFractionated(30, 2, TDF.xFromPerWeek(5));
  close(tdf, 98.0, 0.5);
});

test("TDF matches NSD = D·N^-0.24·T^-0.11 through TDF = 1e-3·NSD^1.538", () => {
  const N = 30, d = 2, T = 40;
  const nsd = N * d * 100 * Math.pow(N, -0.24) * Math.pow(T, -0.11);
  const tdf = TDF.tdfFractionated(N, d, T / N);
  close(tdf, 1e-3 * Math.pow(nsd, 1.538), 0.5);
  close(TDF.nsdFromTdf(tdf), nsd, 5);
});

test("overall time follows the weekly pattern", () => {
  assert.equal(TDF.overallTime(1, 5), 0);
  assert.equal(TDF.overallTime(5, 5), 4);
  assert.equal(TDF.overallTime(6, 5), 7);
  assert.equal(TDF.overallTime(30, 5), 39);
  assert.equal(TDF.overallTime(3, 3), 4);
  assert.equal(TDF.overallTime(4, 3), 7);
});

test("decay factor (T/(T+R))^0.11", () => {
  close(TDF.decayFactor(20, 14), Math.pow(20 / 34, 0.11), 1e-12);
  assert.equal(TDF.decayFactor(20, 0), 1);
});

test("split course applies decay to the accumulated TDF", () => {
  const res = TDF.splitCourse([
    { N: 10, d: 3, perWeek: 5, gapAfter: 21 },
    { N: 10, d: 3, perWeek: 5 },
  ]);
  const one = TDF.tdfFractionated(10, 3, 1.4);
  const T1 = TDF.overallTime(10, 5); // 11
  close(res.total, one * Math.pow(T1 / (T1 + 21), 0.11) + one, 1e-9);
  assert.equal(res.rows[0].factor < 1, true);
});

test("split course with calendar days from dates keeps X = 7/f and uses the days for the decay", () => {
  const res = TDF.splitCourse([
    { N: 20, d: 2, perWeek: 5, days: 30, gapAfter: 12 },
    { N: 10, d: 2, perWeek: 5 },
  ]);
  const one = TDF.tdfFractionated(20, 2, 1.4), two = TDF.tdfFractionated(10, 2, 1.4);
  close(res.total, one * Math.pow(30 / 42, 0.11) + two, 1e-9);
  assert.equal(res.rows[0].endDay, 30);
});

test("fractions needed after a break", () => {
  const r = TDF.fractionsToTarget(50, 98, 2, 5);
  assert.ok(r.reached >= 98);
  assert.ok(r.reached - r.per < 98);
});

test("permanent I-125 145 Gy ≈ TDF 100 and dose integrates correctly", () => {
  const hl = TDF.ISOTOPES["I-125"].halfLifeDays;
  const r0 = TDF.r0FromDose(145, hl, Infinity);
  close(r0, 7.05, 0.02, "initial dose rate");
  const res = TDF.ldrDecaying(r0, hl, Infinity);
  close(res.dose, 145, 1e-9);
  close(res.tdf, 101.3, 0.5);
});

test("decaying source over a finite time tends to the constant-rate result for long half-lives", () => {
  const dec = TDF.ldrDecaying(50, 1e9, 120);
  const con = TDF.ldrConstant(50, 120);
  close(dec.tdf, con.tdf, 1e-4);
  close(dec.dose, con.dose, 1e-4);
});

test("numerical integration of r(t)^1.35 matches the closed form", () => {
  const r0 = 40, hl = 2.695, hours = 200;
  const lam = TDF.lambdaPerHour(hl);
  let sum = 0;
  const steps = 200000, dt = hours / steps;
  for (let i = 0; i < steps; i++) sum += 4.76e-3 * Math.pow(r0 * Math.exp(-lam * (i + 0.5) * dt), 1.35) * dt;
  close(TDF.ldrDecaying(r0, hl, hours).tdf, sum, 1e-4);
});

test("invalid inputs throw", () => {
  assert.throws(() => TDF.tdfPerFraction(0, 1.4));
  assert.throws(() => TDF.overallTime(0, 5));
  assert.throws(() => TDF.overallTime(3, 8));
});
