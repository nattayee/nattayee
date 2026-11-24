import { test } from "node:test";
import assert from "node:assert/strict";
import { sma, ema, rsi, summarize } from "../server/indicators.js";
import { Portfolio, createAccount } from "../server/portfolio.js";
import { applyRisk } from "../server/risk.js";
import { SimulatedFeed } from "../server/market.js";
import { DEFAULT_SETTINGS } from "../server/config.js";

const settings = { ...DEFAULT_SETTINGS };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("sma / ema basics", () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const e = ema([1, 2, 3, 4, 5], 3);
  assert.equal(e[2], 2); // seeded with SMA
  near(e[3], 3); // 4*0.5 + 2*0.5
  near(e[4], 4);
});

test("rsi is 100 on a straight rally and ~0 on a straight drop", () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.equal(rsi(up, 14).at(-1), 100);
  near(rsi(down, 14).at(-1), 0);
});

test("summarize produces finite indicators for 200 candles", async () => {
  const feed = new SimulatedFeed({ rand: () => 0.5 });
  const candles = await feed.getCandles("BTCUSDT", "1h", 200);
  assert.equal(candles.length, 200);
  const s = summarize(candles);
  for (const k of ["price", "ema20", "ema50", "rsi14", "macd_hist", "atr_pct"]) {
    assert.ok(Number.isFinite(s[k]), `${k} = ${s[k]}`);
  }
});

test("portfolio buy/sell accounts for fees and realized P/L", () => {
  const pf = new Portfolio(createAccount(1000), { feeRate: 0.001 });
  pf.buy("BTCUSDT", 500, 100);
  near(pf.account.cash, 1000 - 500 - 0.5);
  near(pf.positions.BTCUSDT.qty, 5);

  pf.setPrices({ BTCUSDT: 110 });
  near(pf.equity(), 499.5 + 550);

  const t = pf.sell("BTCUSDT", 1, 110);
  // proceeds 550 - fee 0.55 - cost 500.5
  near(t.pnl, 48.95);
  near(pf.account.cash, 499.5 + 549.45);
  assert.equal(pf.positions.BTCUSDT, undefined);
});

test("partial sell keeps proportional cost basis", () => {
  const pf = new Portfolio(createAccount(1000), { feeRate: 0 });
  pf.buy("ETHUSDT", 400, 100);
  pf.sell("ETHUSDT", 0.25, 100);
  near(pf.positions.ETHUSDT.qty, 3);
  near(pf.positions.ETHUSDT.cost, 300);
});

test("cannot buy more than available cash", () => {
  const pf = new Portfolio(createAccount(100), { feeRate: 0.001 });
  assert.throws(() => pf.buy("BTCUSDT", 100, 10), /Not enough cash/);
});

test("stop-loss and take-profit triggers", () => {
  const pf = new Portfolio(createAccount(1000), { feeRate: 0 });
  pf.buy("A", 100, 10, { stopLoss: 9, takeProfit: 12 });
  pf.buy("B", 100, 10, { stopLoss: 9, takeProfit: 12 });
  pf.setPrices({ A: 8.9, B: 12.5 });
  const hits = pf.triggeredStops().map((h) => `${h.symbol}:${h.kind}`).sort();
  assert.deepEqual(hits, ["A:STOP_LOSS", "B:TAKE_PROFIT"]);
});

const buyDecision = (over = {}) => ({ action: "BUY", confidence: 0.8, size_pct: 100, stop_loss_pct: 3, take_profit_pct: 6, reasoning: "", ...over });

test("risk: low confidence is rejected", () => {
  const pf = new Portfolio(createAccount(10000));
  const r = applyRisk(buyDecision({ confidence: 0.3 }), { symbol: "BTCUSDT", price: 100, portfolio: pf, settings });
  assert.equal(r.approved, false);
});

test("risk: buy size is capped at maxPositionPct of equity", () => {
  const pf = new Portfolio(createAccount(10000));
  const r = applyRisk(buyDecision(), { symbol: "BTCUSDT", price: 100, portfolio: pf, settings });
  assert.equal(r.approved, true);
  near(r.notional, 2500); // 25% of 10k
  near(r.stopLoss, 97);
  near(r.takeProfit, 106);
});

test("risk: stop-loss beyond the max is clamped, total exposure is capped", () => {
  const pf = new Portfolio(createAccount(10000), { feeRate: 0 });
  pf.buy("A", 2500, 1);
  pf.buy("B", 2500, 1);
  pf.buy("C", 2500, 1); // 75% exposed, room = 5%
  const r = applyRisk(buyDecision({ stop_loss_pct: 40 }), { symbol: "D", price: 1, portfolio: pf, settings });
  assert.equal(r.approved, true);
  near(r.notional, 500);
  near(r.stopLoss, 1 - settings.maxStopLossPct / 100);
});

test("risk: no buy while kill switch is active, no sell without a position", () => {
  const pf = new Portfolio(createAccount(10000));
  assert.equal(applyRisk(buyDecision(), { symbol: "X", price: 1, portfolio: pf, settings, killSwitchActive: true }).approved, false);
  assert.equal(applyRisk({ action: "SELL", confidence: 0.9, size_pct: 100 }, { symbol: "X", price: 1, portfolio: pf, settings }).approved, false);
});

test("risk: no pyramiding into an existing position", () => {
  const pf = new Portfolio(createAccount(10000));
  pf.buy("X", 100, 1);
  assert.equal(applyRisk(buyDecision(), { symbol: "X", price: 1, portfolio: pf, settings }).approved, false);
});

test("simulated feed keeps the last candle in sync with the live price", async () => {
  let now = Date.UTC(2026, 0, 1, 10, 30);
  const feed = new SimulatedFeed({ now: () => now });
  const c1 = await feed.getCandles("ETHUSDT", "1h", 50);
  now += 2 * 60 * 60_000; // two hours later
  const prices = await feed.getPrices(["ETHUSDT"]);
  const c2 = await feed.getCandles("ETHUSDT", "1h", 50);
  assert.equal(c2.at(-1).close, prices.ETHUSDT);
  assert.equal(c2.at(-1).time - c1.at(-1).time, 2 * 3600);
  for (let i = 1; i < c2.length; i++) assert.ok(c2[i].time > c2[i - 1].time);
});
