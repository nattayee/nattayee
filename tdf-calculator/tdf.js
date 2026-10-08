/*
 * Time-Dose-Fractionation (TDF) model — Orton & Ellis (1973), Orton (1974).
 *
 * Fractionated:     TDF = 1.19 · N · d^1.538 · X^-0.169      (d in Gy, X = days between fractions)
 * Rest-gap decay:   TDF_after = TDF_before · (T / (T + R))^0.11   (T = days from start to break, R = rest days)
 * Continuous LDR:   TDF = 4.76e-3 · r^1.35 · t               (r in cGy/h, t in h)
 * Decaying source:  TDF = 4.76e-3 · r0^1.35 · (1 − e^(−1.35·λ·t)) / (1.35·λ)
 * NSD (ret):        TDF = 1e-3 · NSD^1.538
 *
 * Works in the browser (window.TDF) and in Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  // Always publish window.TDF in a browser: some hosts (Google Apps Script pages) define a global `module`,
  // which must not stop the page from getting the library.
  if (root && typeof root.document !== "undefined") root.TDF = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else if (root) root.TDF = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this, function () {
  "use strict";

  const D_EXP = 1.538;
  const X_EXP = -0.169;
  const FRAC_K = 1.19;
  const DECAY_EXP = 0.11;
  const LDR_K = 4.76e-3;
  const R_EXP = 1.35;
  const LDR_VALID_MIN = 25; // cGy/h — Orton's data extend down to about this dose rate

  // Fraction days within a week (0 = first treatment day) for f fractions/week.
  const WEEK_PATTERNS = {
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  };

  const ISOTOPES = {
    "I-125": { halfLifeDays: 59.40 },
    "Pd-103": { halfLifeDays: 16.99 },
    "Cs-131": { halfLifeDays: 9.69 },
    "Au-198": { halfLifeDays: 2.695 },
    "Ir-192": { halfLifeDays: 73.83 },
    "Cs-137": { halfLifeDays: 30.08 * 365.25 },
    "Co-60": { halfLifeDays: 5.2713 * 365.25 },
  };

  function assertPositive(name, v) {
    if (!(Number.isFinite(v) && v > 0)) throw new RangeError(name + " must be a positive number");
  }

  /** Days from the first to the last fraction when N fractions follow the weekly pattern. */
  function overallTime(N, perWeek) {
    const pat = WEEK_PATTERNS[perWeek];
    if (!pat) throw new RangeError("fractions per week must be 1–7");
    if (!(Number.isInteger(N) && N >= 1)) throw new RangeError("N must be a whole number ≥ 1");
    const k = N - 1;
    return 7 * Math.floor(k / perWeek) + pat[k % perWeek];
  }

  /** TDF of one fraction of d Gy with X days between fractions. */
  function tdfPerFraction(dGy, X) {
    assertPositive("Dose per fraction", dGy);
    assertPositive("Fraction interval X", X);
    return FRAC_K * Math.pow(dGy, D_EXP) * Math.pow(X, X_EXP);
  }

  /** TDF of N fractions of d Gy, X days apart. */
  function tdfFractionated(N, dGy, X) {
    assertPositive("Number of fractions", N);
    return N * tdfPerFraction(dGy, X);
  }

  /** X from a weekly schedule, as in the Orton–Ellis tables: X = 7 / f. */
  function xFromPerWeek(perWeek) {
    assertPositive("Fractions per week", perWeek);
    return 7 / perWeek;
  }

  /** Repopulation decay factor for a rest gap of R days after T days of treatment. */
  function decayFactor(T, R) {
    if (!(R >= 0)) throw new RangeError("Rest interval must be ≥ 0");
    if (R === 0) return 1;
    assertPositive("Elapsed time before the break", T);
    return Math.pow(T / (T + R), DECAY_EXP);
  }

  function nsdFromTdf(tdf) {
    return Math.pow(1000 * tdf, 1 / D_EXP);
  }

  /** Equivalent number of fractions / total dose at d Gy, f fractions per week, for a given TDF. */
  function equivalentSchedule(tdf, dGy = 2, perWeek = 5) {
    const per = tdfPerFraction(dGy, xFromPerWeek(perWeek));
    const n = tdf / per;
    return { fractions: n, dose: n * dGy };
  }

  /** Linear-quadratic comparison values (D total Gy, d Gy per fraction). */
  function lq(Dtotal, dGy, alphaBeta) {
    assertPositive("α/β", alphaBeta);
    const bed = Dtotal * (1 + dGy / alphaBeta);
    return { bed, eqd2: bed / (1 + 2 / alphaBeta) };
  }

  /**
   * Split-course treatment. Each course: { N, d, perWeek, T?, days?, startDay?, gapAfter? } (days: calendar span from dates,
   * startDay: calendar day of its first fraction counted from the first fraction of the treatment).
   * T defaults to the calendar overall time from the weekly pattern; X = T/N when T is
   * supplied explicitly and N > 1, otherwise X = 7/perWeek.
   * Before each gap the accumulated TDF is multiplied by (Telapsed / (Telapsed + R))^0.11,
   * with Telapsed counted from the first fraction of the whole treatment.
   */
  function splitCourse(courses) {
    let accumulated = 0;
    let day = 0; // day index of the current course's first fraction
    const rows = [];
    const timeline = [{ day: 0, tdf: 0 }];

    courses.forEach((c, i) => {
      const N = c.N;
      // from dates, a course can start later than the end of the previous break (e.g. a weekend in between)
      if (c.startDay != null && c.startDay !== "" && Number(c.startDay) > day) day = Number(c.startDay);
      // c.days: calendar days from the first to the last fraction (e.g. from dates). It sets the elapsed
      // time used by the decay factor and the timeline, while X stays 7 / fractions-per-week.
      const hasDays = c.days != null && c.days !== "" && Number(c.days) >= 0;
      const T = hasDays ? Number(c.days) : c.T != null && c.T !== "" ? Number(c.T) : overallTime(N, c.perWeek);
      const X = !hasDays && c.T != null && c.T !== "" && N > 1 && T > 0 ? T / N : xFromPerWeek(c.perWeek);
      const per = tdfPerFraction(c.d, X);
      const tdf = N * per;

      // timeline: one point per fraction (cumulative), spread evenly over T
      for (let k = 1; k <= N; k++) {
        const fxDay = N > 1 ? day + (T * (k - 1)) / (N - 1) : day;
        timeline.push({ day: fxDay, tdf: accumulated + per * k });
      }
      accumulated += tdf;
      const endDay = day + T;

      const R = i < courses.length - 1 ? Number(c.gapAfter || 0) : 0;
      let factor = 1;
      let elapsed = endDay;
      if (R > 0) {
        // elapsed from start of therapy to the break; a one-day minimum keeps a
        // single-fraction first course from decaying to zero
        elapsed = Math.max(endDay, 1);
        factor = decayFactor(elapsed, R);
      }
      const before = accumulated;
      accumulated *= factor;
      rows.push({ index: i + 1, N, d: c.d, dose: N * c.d, T, X, tdf, startDay: day, endDay, gap: R, elapsed, factor, before, after: accumulated });
      if (R > 0) timeline.push({ day: endDay + R, tdf: accumulated, gapEnd: true });
      day = endDay + R;
    });

    return { total: accumulated, rows, timeline, totalDays: day };
  }

  /** Fractions needed (at d Gy, f/week) for a following course to reach targetTdf from currentTdf. */
  function fractionsToTarget(currentTdf, targetTdf, dGy, perWeek) {
    const per = tdfPerFraction(dGy, xFromPerWeek(perWeek));
    const need = targetTdf - currentTdf;
    if (need <= 0) return { need, exact: 0, fractions: 0, dose: 0, per };
    const exact = need / per;
    const fractions = Math.ceil(exact - 1e-9);
    return { need, exact, fractions, dose: fractions * dGy, per, reached: currentTdf + fractions * per };
  }

  function lambdaPerHour(halfLifeDays) {
    assertPositive("Half-life", halfLifeDays);
    return Math.LN2 / (halfLifeDays * 24);
  }

  /** Constant dose-rate LDR: r cGy/h for t hours. */
  function ldrConstant(rate, hours) {
    assertPositive("Dose rate", rate);
    assertPositive("Treatment time", hours);
    return { tdf: LDR_K * Math.pow(rate, R_EXP) * hours, dose: (rate * hours) / 100 };
  }

  /**
   * Decaying source. r0 cGy/h initial dose rate, half-life in days, treatment time in hours
   * (Infinity for a permanent implant).
   */
  function ldrDecaying(r0, halfLifeDays, hours) {
    assertPositive("Initial dose rate", r0);
    const lam = lambdaPerHour(halfLifeDays);
    const t = hours === Infinity ? Infinity : hours;
    if (t !== Infinity) assertPositive("Treatment time", t);
    const fDose = t === Infinity ? 1 : 1 - Math.exp(-lam * t);
    const fTdf = t === Infinity ? 1 : 1 - Math.exp(-R_EXP * lam * t);
    const tdf = (LDR_K * Math.pow(r0, R_EXP) * fTdf) / (R_EXP * lam);
    const dose = (r0 * fDose) / lam / 100; // Gy
    const endRate = t === Infinity ? 0 : r0 * Math.exp(-lam * t);
    const tBelowValid = r0 > LDR_VALID_MIN ? Math.log(r0 / LDR_VALID_MIN) / lam : 0; // h until r < 25 cGy/h
    return {
      tdf,
      dose,
      lambda: lam,
      meanLife: 1 / lam,
      endRate,
      t90tdf: Math.log(10) / (R_EXP * lam), // h to deliver 90 % of the permanent-implant TDF
      t90dose: Math.log(10) / lam,
      tBelowValid,
    };
  }

  /** Initial dose rate (cGy/h) giving total dose D (Gy) over t hours (Infinity = permanent). */
  function r0FromDose(Dgy, halfLifeDays, hours) {
    assertPositive("Total dose", Dgy);
    const lam = lambdaPerHour(halfLifeDays);
    const f = hours === Infinity ? 1 : 1 - Math.exp(-lam * hours);
    return (Dgy * 100 * lam) / f;
  }

  return {
    constants: { D_EXP, X_EXP, FRAC_K, DECAY_EXP, LDR_K, R_EXP, LDR_VALID_MIN },
    WEEK_PATTERNS,
    ISOTOPES,
    overallTime,
    tdfPerFraction,
    tdfFractionated,
    xFromPerWeek,
    decayFactor,
    nsdFromTdf,
    equivalentSchedule,
    lq,
    splitCourse,
    fractionsToTarget,
    lambdaPerHour,
    ldrConstant,
    ldrDecaying,
    r0FromDose,
  };
});
