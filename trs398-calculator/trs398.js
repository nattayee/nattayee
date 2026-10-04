/*
 * IAEA TRS-398 absorbed-dose-to-water calculation core.
 * Pure functions only: no DOM access, so the same file runs in the browser
 * (window.TRS398) and in Node (require('./trs398.js')) for testing.
 *
 *   D_w,Q(z_ref) = M_Q · N_D,w,Q0 · k_Q,Q0 · k_Q,Qcross
 *   M_Q          = M̄ · k_TP · k_elec · k_pol · k_s · k_vol
 *
 * Units follow the LPCH worksheet: readings in nC, N_D,w in cGy/nC, dose in cGy.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TRS398 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Reference conditions for the chamber calibration (TRS-398 §4.4.3.1)
  var T0 = 20.0;        // °C
  var P0 = 101.325;     // kPa

  // TRS-398 Table 4.VII: two-voltage technique coefficients for k_s.
  // Rows: V1/V2 → [a0, a1, a2]
  var KS_COEFFS = {
    pulsed: [
      [2.0, 2.337, -3.636, 2.299],
      [2.5, 1.474, -1.587, 1.114],
      [3.0, 1.198, -0.875, 0.677],
      [3.5, 1.080, -0.542, 0.463],
      [4.0, 1.022, -0.363, 0.341],
      [5.0, 0.975, -0.188, 0.214]
    ],
    scanned: [
      [2.0, 4.711, -8.242, 4.533],
      [2.5, 2.719, -3.977, 2.261],
      [3.0, 2.001, -2.402, 1.404],
      [3.5, 1.665, -1.647, 0.984],
      [4.0, 1.468, -1.200, 0.734],
      [5.0, 1.279, -0.750, 0.474]
    ]
  };

  var PRESSURE_TO_KPA = { kPa: 1, hPa: 0.1, mmHg: 0.133322368 };

  function parseReadings(text) {
    if (text == null) return [];
    return String(text)
      .split(/[\s,;]+/)
      .filter(function (s) { return s !== ''; })
      .map(Number)
      .filter(function (v) { return isFinite(v); })
      .map(Math.abs);
  }

  function stats(values) {
    var n = values.length;
    if (!n) return null;
    var mean = values.reduce(function (a, b) { return a + b; }, 0) / n;
    var sd = 0;
    if (n > 1) {
      sd = Math.sqrt(values.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / (n - 1));
    }
    return { n: n, mean: mean, sd: sd, cv: mean ? (100 * sd) / mean : 0 };
  }

  function kTP(tempC, pressure, unit) {
    var pKPa = pressure * (PRESSURE_TO_KPA[unit] || 1);
    return ((273.2 + tempC) / (273.2 + T0)) * (P0 / pKPa);
  }

  // TRS-398 eq. for polarity: k_pol = (|M+| + |M−|) / (2M), M = reading at the routine polarity
  function kPol(mNormal, mOpposite) {
    return (Math.abs(mNormal) + Math.abs(mOpposite)) / (2 * Math.abs(mNormal));
  }

  // Coefficients for an arbitrary V1/V2 ratio: exact row if tabulated,
  // otherwise linear interpolation between the neighbouring rows.
  function ksCoefficients(ratio, beam) {
    var table = KS_COEFFS[beam];
    if (!table) return null;
    var lo = table[0][0], hi = table[table.length - 1][0];
    if (ratio < lo - 1e-9 || ratio > hi + 1e-9) return null;
    for (var i = 0; i < table.length; i++) {
      if (Math.abs(table[i][0] - ratio) < 1e-6) {
        return { a0: table[i][1], a1: table[i][2], a2: table[i][3], interpolated: false };
      }
    }
    for (var j = 0; j < table.length - 1; j++) {
      var r1 = table[j], r2 = table[j + 1];
      if (ratio > r1[0] && ratio < r2[0]) {
        var f = (ratio - r1[0]) / (r2[0] - r1[0]);
        return {
          a0: r1[1] + f * (r2[1] - r1[1]),
          a1: r1[2] + f * (r2[2] - r1[2]),
          a2: r1[3] + f * (r2[3] - r1[3]),
          interpolated: true
        };
      }
    }
    return null;
  }

  // Two-voltage recombination correction (TRS-398 §4.4.3.4)
  function kS(m1, m2, v1, v2, beam) {
    var vr = v1 / v2;
    var mr = m1 / m2;
    if (beam === 'continuous') {
      return { value: (vr * vr - 1) / (vr * vr - mr), ratio: vr, coeffs: null };
    }
    var c = ksCoefficients(vr, beam);
    if (!c) return { value: NaN, ratio: vr, coeffs: null };
    return { value: c.a0 + c.a1 * mr + c.a2 * mr * mr, ratio: vr, coeffs: c };
  }

  // Photon beam quality: TPR20,10 from PDD20,10 (TRS-398 eq. for SSD = 100 cm, 10×10 cm²)
  function tprFromPdd(pdd2010) {
    return 1.2661 * pdd2010 - 0.0595;
  }

  // Electron beam quality: R50 from I50 (g/cm²), TRS-398 §7.2.1
  function r50FromI50(i50) {
    return i50 <= 10 ? 1.029 * i50 - 0.06 : 1.059 * i50 - 0.37;
  }

  function electronZref(r50) {
    return 0.6 * r50 - 0.1;
  }

  // k_Q table from a grid of beam-quality values and the matching k_Q values
  function kqRowsFromGrid(grid, kq) {
    var rows = [];
    for (var i = 0; i < Math.min(grid.length, kq.length); i++) {
      if (isFinite(grid[i]) && isFinite(kq[i]) && kq[i] > 0) rows.push([grid[i], kq[i]]);
    }
    return rows;
  }

  // k_Q from a user-supplied table "Q kQ" per line, linear interpolation
  function parseKqTable(text) {
    var rows = [];
    String(text || '').split(/\n+/).forEach(function (line) {
      var parts = line.trim().split(/[\s,;\t]+/).map(Number);
      if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) rows.push([parts[0], parts[1]]);
    });
    rows.sort(function (a, b) { return a[0] - b[0]; });
    return rows;
  }

  function interpolateKq(rows, q) {
    if (rows.length < 2 || !isFinite(q)) return null;
    if (q < rows[0][0] || q > rows[rows.length - 1][0]) return null;
    for (var i = 0; i < rows.length - 1; i++) {
      var a = rows[i], b = rows[i + 1];
      if (q >= a[0] && q <= b[0]) {
        if (b[0] === a[0]) return a[1];
        return a[1] + ((q - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      }
    }
    return null;
  }

  /*
   * Full worksheet calculation.
   * inp: {
   *   beam: 'photon'|'electron', setup: 'SSD'|'SAD', mu,
   *   qMethod: 'ratio'|'tpr'|'pdd' (photon) | 'r50'|'i50' (electron), qValue,
   *   m10, m20  (readings at 10 and 20 g/cm², SAD 100, for qMethod 'ratio'),
   *   ndw (cGy/nC), kelec, kvol, kcross,
   *   kqMode: 'table'|'direct'|'unity', kqRows ([[Q, kQ], ...]) or kqTable (text), kqDirect,
   *   tempC, pressure, pUnit,
   *   readNormal, readOpposite, readLow  (strings, nC),
   *   usePol, useKs, v1, v2, recomb: 'pulsed'|'scanned'|'continuous',
   *   depthDose  (PDD % for SSD / electron, TMR for SAD),
   *   expected (cGy/MU), warnPct, tolPct
   * }
   */
  function calculate(inp) {
    var out = { warnings: [], errors: [] };
    var W = out.warnings, E = out.errors;

    // Beam quality and reference depth
    if (inp.beam === 'electron') {
      var r50 = inp.qMethod === 'i50' ? r50FromI50(inp.qValue) : inp.qValue;
      out.q = r50;
      out.qLabel = 'R50';
      out.zref = electronZref(r50);
      if (!(r50 > 0)) E.push('ต้องระบุ R50 หรือ I50 ที่มากกว่า 0');
      else if (r50 < 4 && inp.chamberType !== 'pp') W.push('R50 < 4 g/cm²: TRS-398 กำหนดให้ใช้หัววัดแบบ plane-parallel ตรวจสอบรุ่นหัววัดที่ใช้');
    } else {
      var tpr;
      if (inp.qMethod === 'ratio') {
        var s10 = stats(parseReadings(inp.m10)), s20 = stats(parseReadings(inp.m20));
        out.read10 = s10; out.read20 = s20;
        tpr = s10 && s20 ? s20.mean / s10.mean : NaN;
        if (!(s10 && s20)) E.push('ต้องมีค่าที่อ่านได้ที่ระดับลึก 10 และ 20 g/cm² เพื่อหา TPR20,10');
      } else tpr = inp.qMethod === 'pdd' ? tprFromPdd(inp.qValue) : inp.qValue;
      out.q = tpr;
      out.qLabel = 'TPR20,10';
      out.zref = 10;
      if (!(tpr > 0.5 && tpr < 0.85)) E.push('TPR20,10 อยู่นอกช่วงที่ TRS-398 ครอบคลุม (0.50–0.84)');
    }

    // k_Q,Q0
    if (inp.kqMode === 'unity') {
      out.kq = 1;
    } else if (inp.kqMode === 'table') {
      var rows = inp.kqRows || parseKqTable(inp.kqTable);
      out.kqRows = rows.length;
      out.kq = interpolateKq(rows, out.q);
      if (rows.length < 2) E.push('ตาราง k_Q ต้องมีอย่างน้อย 2 แถว');
      else if (out.kq == null) E.push('ค่า ' + out.qLabel + ' อยู่นอกช่วงของตาราง k_Q ที่ใส่ไว้');
    } else {
      out.kq = inp.kqDirect;
    }
    if (!(out.kq > 0.8 && out.kq < 1.2)) E.push('ค่า k_Q,Q0 ไม่ถูกต้อง');

    // Readings
    var sN = stats(parseReadings(inp.readNormal));
    var sO = stats(parseReadings(inp.readOpposite));
    var sL = stats(parseReadings(inp.readLow));
    out.readNormal = sN; out.readOpposite = sO; out.readLow = sL;
    if (!sN) E.push('ต้องมีค่าที่อ่านได้อย่างน้อย 1 ค่าที่ polarity และแรงดันปกติ');
    if (sN && sN.n > 1 && sN.cv > 0.1) W.push('ค่าที่อ่านซ้ำกระจายเกิน 0.1% (CV ' + sN.cv.toFixed(2) + '%) ตรวจสอบความเสถียรของการวัด');

    // k_TP
    out.ktp = kTP(inp.tempC, inp.pressure, inp.pUnit);
    if (!(inp.tempC > 10 && inp.tempC < 40)) W.push('อุณหภูมิผิดปกติ ตรวจสอบหน่วย (°C)');
    var pK = inp.pressure * (PRESSURE_TO_KPA[inp.pUnit] || 1);
    out.pressureKPa = pK;
    if (!(pK > 70 && pK < 110)) W.push('ความดันผิดปกติ ตรวจสอบหน่วยที่เลือก');

    // k_pol
    out.kpol = 1;
    if (inp.usePol) {
      if (sN && sO) {
        out.kpol = kPol(sN.mean, sO.mean);
        if (Math.abs(out.kpol - 1) > 0.003) W.push('k_pol ต่างจาก 1 เกิน 0.3% ตรวจสอบหัววัดหรือการต่อสาย');
      } else E.push('ต้องมีค่าที่อ่านได้ที่ polarity ตรงข้ามเพื่อคำนวณ k_pol');
    }

    // k_s
    out.ks = 1;
    if (inp.useKs) {
      if (sN && sL && inp.v1 > 0 && inp.v2 > 0) {
        if (inp.v2 >= inp.v1) E.push('V2 ต้องน้อยกว่า V1');
        var ks = kS(sN.mean, sL.mean, inp.v1, inp.v2, inp.recomb);
        out.ks = ks.value;
        out.ksRatio = ks.ratio;
        out.ksCoeffs = ks.coeffs;
        if (!isFinite(ks.value)) E.push('V1/V2 = ' + ks.ratio.toFixed(2) + ' อยู่นอกช่วงตาราง 4.VII (2.0–5.0)');
        else {
          if (ks.coeffs && ks.coeffs.interpolated) W.push('V1/V2 = ' + ks.ratio.toFixed(2) + ' ไม่ตรงกับแถวในตาราง 4.VII ใช้การประมาณค่าเชิงเส้นของสัมประสิทธิ์');
          if (ks.value > 1.05) W.push('k_s > 1.05: TRS-398 แนะนำให้ใช้หัววัดอื่น');
          if (ks.value < 1) W.push('k_s < 1: ตรวจสอบค่าที่อ่านที่แรงดัน V2 (ควรน้อยกว่าที่ V1)');
        }
      } else E.push('ต้องมีค่าที่อ่านได้ที่แรงดัน V2 และค่า V1, V2 เพื่อคำนวณ k_s');
    }

    out.kelec = inp.kelec;
    out.kvol = inp.kvol;
    out.kcross = isFinite(inp.kcross) && inp.kcross > 0 ? inp.kcross : 1;
    if (!(inp.ndw > 0)) E.push('ต้องระบุ N_D,w,Q0');
    else if (inp.ndw > 100) E.push('N_D,w ต้องเป็นหน่วย cGy/nC (เช่น 5.307) ไม่ใช่ Gy/C');
    if (!(inp.mu > 0)) E.push('ต้องระบุจำนวน MU');

    if (sN) {
      out.mRaw = sN.mean;                                   // nC
      out.mCorr = sN.mean * out.ktp * inp.kelec * out.kpol * out.ks * inp.kvol;   // nC
      out.dZref = out.mCorr * inp.ndw * out.kq * out.kcross; // cGy
    }

    // Transfer to the depth of maximum dose
    out.depthDoseKind = inp.beam === 'photon' && inp.setup === 'SAD' ? 'TMR' : 'PDD';
    var frac = out.depthDoseKind === 'TMR' ? inp.depthDose : inp.depthDose / 100;
    out.depthFrac = frac;
    if (!(frac > 0 && frac <= 1.0001)) E.push(out.depthDoseKind === 'TMR' ? 'TMR(z_ref) ต้องอยู่ระหว่าง 0 ถึง 1' : 'PDD(z_ref) ต้องอยู่ระหว่าง 0 ถึง 100%');
    if (out.dZref != null && frac > 0) {
      out.dMax = out.dZref / frac;                          // cGy
      out.dZrefPerMU = out.dZref / inp.mu;                  // cGy/MU at z_ref
      out.outputPerMU = out.dMax / inp.mu;                  // cGy/MU at z_max
      if (inp.expected > 0) {
        out.deviation = (100 * (out.outputPerMU - inp.expected)) / inp.expected;
        var a = Math.abs(out.deviation);
        out.status = a <= inp.warnPct ? 'pass' : a <= inp.tolPct ? 'warn' : 'fail';
      }
    }

    out.ok = E.length === 0 && isFinite(out.outputPerMU);
    return out;
  }

  return {
    T0: T0, P0: P0, KS_COEFFS: KS_COEFFS,
    parseReadings: parseReadings, stats: stats,
    kTP: kTP, kPol: kPol, kS: kS, ksCoefficients: ksCoefficients,
    tprFromPdd: tprFromPdd, r50FromI50: r50FromI50, electronZref: electronZref,
    parseKqTable: parseKqTable, interpolateKq: interpolateKq, kqRowsFromGrid: kqRowsFromGrid,
    calculate: calculate
  };
});
