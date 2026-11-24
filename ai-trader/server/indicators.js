// Technical indicators. Every function returns an array aligned with its input,
// with `null` where there is not enough data yet.

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Wilder's RSI.
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const line = values.map((_, i) =>
    fastE[i] == null || slowE[i] == null ? null : fastE[i] - slowE[i],
  );
  const start = line.findIndex((v) => v != null);
  const signal = new Array(values.length).fill(null);
  if (start >= 0) {
    const sig = ema(line.slice(start), signalPeriod);
    sig.forEach((v, i) => (signal[start + i] = v));
  }
  const hist = line.map((v, i) => (v == null || signal[i] == null ? null : v - signal[i]));
  return { line, signal, hist };
}

export function atr(candles, period = 14) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  const out = new Array(candles.length).fill(null);
  if (candles.length < period) return out;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const sd = Math.sqrt(slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { mid, upper, lower };
}

const last = (arr) => arr[arr.length - 1];
const round = (v, d = 4) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

// Snapshot of the latest indicator values, used by both the AI prompt and the rule strategy.
export function summarize(candles) {
  const closes = candles.map((c) => c.close);
  const price = last(closes);
  const ema20 = last(ema(closes, 20));
  const ema50 = last(ema(closes, 50));
  const ema200 = last(ema(closes, 200));
  const m = macd(closes);
  const a = last(atr(candles, 14));
  const bb = bollinger(closes, 20, 2);
  const changeOver = (n) =>
    closes.length > n ? ((price - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 100 : null;
  const vols = candles.map((c) => c.volume);
  const avgVol20 = last(sma(vols, 20));

  let trend = "sideways";
  if (ema20 != null && ema50 != null) {
    if (price > ema20 && ema20 > ema50) trend = "uptrend";
    else if (price < ema20 && ema20 < ema50) trend = "downtrend";
  }

  return {
    price: round(price, 8),
    change_1_candle_pct: round(changeOver(1), 3),
    change_24_candles_pct: round(changeOver(24), 3),
    ema20: round(ema20, 8),
    ema50: round(ema50, 8),
    ema200: round(ema200, 8),
    rsi14: round(last(rsi(closes, 14)), 2),
    macd: round(last(m.line), 8),
    macd_signal: round(last(m.signal), 8),
    macd_hist: round(last(m.hist), 8),
    macd_hist_prev: round(m.hist[m.hist.length - 2], 8),
    atr14: round(a, 8),
    atr_pct: round(a != null ? (a / price) * 100 : null, 3),
    bb_upper: round(last(bb.upper), 8),
    bb_lower: round(last(bb.lower), 8),
    volume_vs_avg20: round(avgVol20 ? last(vols) / avgVol20 : null, 3),
    trend,
  };
}
