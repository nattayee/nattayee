// Market data: real prices from Binance's public API (no key needed),
// or a simulated random-walk feed for offline demos and tests.

export const INTERVAL_MS = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export class BinanceFeed {
  constructor({ baseUrl, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
    this.name = "binance";
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async #get(pathAndQuery) {
    const res = await this.fetch(`${this.baseUrl}${pathAndQuery}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  async getCandles(symbol, interval, limit = 200) {
    const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
    const rows = await this.#get(`/api/v3/klines?${q}`);
    return rows.map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
  }

  async getPrices(symbols) {
    if (symbols.length === 0) return {};
    const q = new URLSearchParams({ symbols: JSON.stringify(symbols) });
    const rows = await this.#get(`/api/v3/ticker/price?${q}`);
    return Object.fromEntries(rows.map((r) => [r.symbol, Number(r.price)]));
  }

  async isValidSymbol(symbol) {
    try {
      await this.getPrices([symbol]);
      return true;
    } catch {
      return false;
    }
  }
}

const BASE_PRICES = { BTCUSDT: 95000, ETHUSDT: 3400, SOLUSDT: 180, BNBUSDT: 650, XRPUSDT: 2.2, DOGEUSDT: 0.35 };

function randn(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Seeded PRNG so a symbol's simulated history looks the same between restarts.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export class SimulatedFeed {
  // volPerMinute ≈ 0.15% → roughly 1.2% per hour, in line with typical crypto volatility.
  constructor({ volPerMinute = 0.0015, now = () => Date.now(), rand = Math.random } = {}) {
    this.name = "simulated";
    this.vol = volPerMinute;
    this.now = now;
    this.rand = rand;
    this.prices = new Map(); // symbol -> { price, at }
    this.series = new Map(); // `${symbol}:${interval}` -> candles
  }

  #tick(symbol) {
    const now = this.now();
    const cur = this.prices.get(symbol);
    if (!cur) {
      const price = BASE_PRICES[symbol] ?? 100;
      this.prices.set(symbol, { price, at: now });
      return price;
    }
    const minutes = Math.max(0, (now - cur.at) / 60_000);
    if (minutes > 0) {
      cur.price *= Math.exp(randn(this.rand) * this.vol * Math.sqrt(minutes));
      cur.at = now;
    }
    return cur.price;
  }

  async getPrices(symbols) {
    return Object.fromEntries(symbols.map((s) => [s, this.#tick(s)]));
  }

  async getCandles(symbol, interval, limit = 200) {
    const step = INTERVAL_MS[interval];
    if (!step) throw new Error(`Unsupported interval ${interval}`);
    const price = this.#tick(symbol);
    const now = this.now();
    const currentOpen = Math.floor(now / step) * step;
    const key = `${symbol}:${interval}`;
    let candles = this.series.get(key);

    if (!candles) {
      // Walk backwards from the current price to build a plausible history.
      const rand = mulberry32(hashString(key));
      const stepVol = this.vol * Math.sqrt(step / 60_000);
      candles = [];
      let close = price;
      for (let i = 0; i < limit; i++) {
        const open = close / Math.exp(randn(rand) * stepVol);
        const wick = Math.abs(randn(rand)) * stepVol * 0.5;
        candles.unshift({
          time: (currentOpen - i * step) / 1000,
          open,
          high: Math.max(open, close) * (1 + wick),
          low: Math.min(open, close) * (1 - wick),
          close,
          volume: 1000 * (0.5 + rand()),
        });
        close = open;
      }
      this.series.set(key, candles);
    }

    // Roll forward new candles and keep the last one in sync with the live price.
    let lastC = candles[candles.length - 1];
    while (lastC.time * 1000 < currentOpen) {
      const c = { time: lastC.time + step / 1000, open: lastC.close, high: lastC.close, low: lastC.close, close: lastC.close, volume: 1000 * (0.5 + this.rand()) };
      candles.push(c);
      lastC = c;
    }
    lastC.close = price;
    lastC.high = Math.max(lastC.high, price);
    lastC.low = Math.min(lastC.low, price);
    if (candles.length > 1000) candles.splice(0, candles.length - 1000);

    return candles.slice(-limit).map((c) => ({ ...c }));
  }

  async isValidSymbol(symbol) {
    return /^[A-Z0-9]{5,20}$/.test(symbol);
  }
}

// Decide once at startup which feed to use, so paper positions are never
// valued with a mix of real and simulated prices.
export async function createMarketFeed({ mode, baseUrl, fetchImpl, log = console }) {
  if (mode === "simulated") return new SimulatedFeed();
  const binance = new BinanceFeed({ baseUrl, fetchImpl });
  if (mode === "binance") return binance;
  try {
    await binance.getPrices(["BTCUSDT"]);
    return binance;
  } catch (err) {
    log.warn?.(`[market] Binance unreachable (${err.message}) — using simulated prices.`);
    return new SimulatedFeed();
  }
}
