import { test } from "node:test";
import assert from "node:assert/strict";
import { TradingBot } from "../server/bot.js";
import { Store } from "../server/store.js";
import { createClaudeProvider, rulesProvider } from "../server/ai.js";
import { createApp } from "../server/index.js";

const silent = { info() {}, warn() {}, error() {} };

// A market whose price we control directly.
function fakeMarket(prices) {
  return {
    name: "fake",
    prices,
    async getPrices(symbols) {
      return Object.fromEntries(symbols.map((s) => [s, this.prices[s]]));
    },
    async getCandles(symbol, _interval, limit) {
      const p = this.prices[symbol];
      return Array.from({ length: limit }, (_, i) => ({
        time: 1_700_000_000 + i * 3600,
        open: p * (0.9 + i * 0.0005),
        high: p * (0.91 + i * 0.0005),
        low: p * (0.89 + i * 0.0005),
        close: i === limit - 1 ? p : p * (0.9 + i * 0.0005),
        volume: 100,
      }));
    },
    async isValidSymbol() {
      return true;
    },
  };
}

function scriptedProvider(decisions) {
  return {
    name: "script",
    label: "script",
    async decide({ symbol }) {
      return { source: "script", model: null, usage: null, costUsd: null, ...decisions[symbol] };
    },
  };
}

function makeBot(provider, prices = { BTCUSDT: 100, ETHUSDT: 10 }) {
  const store = new Store(null);
  store.state.settings.symbols = Object.keys(prices);
  const market = fakeMarket(prices);
  return { bot: new TradingBot({ store, market, provider, log: silent }), market, store };
}

test("a decision cycle executes approved trades and logs every decision", async () => {
  const { bot } = makeBot(
    scriptedProvider({
      BTCUSDT: { action: "BUY", confidence: 0.9, size_pct: 100, stop_loss_pct: 2, take_profit_pct: 4, reasoning: "ทดสอบ" },
      ETHUSDT: { action: "HOLD", confidence: 0.5, size_pct: 0, stop_loss_pct: 0, take_profit_pct: 0, reasoning: "รอ" },
    }),
  );
  await bot.runCycle();
  assert.equal(bot.state.decisions.length, 2);
  assert.ok(bot.portfolio.positions.BTCUSDT);
  assert.equal(bot.portfolio.positions.ETHUSDT, undefined);
  const btc = bot.state.decisions.find((d) => d.symbol === "BTCUSDT");
  assert.equal(btc.executed, true);
  assert.ok(Math.abs(bot.portfolio.positions.BTCUSDT.stopLoss - 98) < 1e-9);
});

test("price tick closes a position at its stop-loss", async () => {
  const { bot, market } = makeBot(
    scriptedProvider({ BTCUSDT: { action: "BUY", confidence: 0.9, size_pct: 100, stop_loss_pct: 2, take_profit_pct: 4, reasoning: "" } }),
    { BTCUSDT: 100 },
  );
  await bot.runCycle();
  market.prices.BTCUSDT = 97;
  await bot.tick();
  assert.equal(bot.portfolio.positions.BTCUSDT, undefined);
  assert.equal(bot.state.account.trades[0].reason, "ชน Stop-loss");
});

test("daily loss kill switch stops the bot", async () => {
  const { bot, market } = makeBot(
    scriptedProvider({ BTCUSDT: { action: "BUY", confidence: 0.9, size_pct: 100, stop_loss_pct: 50, take_profit_pct: 100, reasoning: "" } }),
    { BTCUSDT: 100 },
  );
  bot.state.settings.maxPositionPct = 100;
  bot.state.settings.maxStopLossPct = 50;
  await bot.tick(); // sets the day's starting equity
  bot.state.botEnabled = true;
  await bot.runCycle();
  market.prices.BTCUSDT = 70; // -30% on a ~80% position
  await bot.tick();
  bot.shutdown();
  assert.equal(bot.state.killSwitch.active, true);
  assert.equal(bot.running, false);
  assert.throws(() => bot.start(), /Kill switch/);
});

test("provider errors are logged as ERROR decisions, not trades", async () => {
  const { bot } = makeBot({ name: "x", label: "x", decide: async () => { throw new Error("boom"); } }, { BTCUSDT: 100 });
  await bot.runCycle();
  assert.equal(bot.state.decisions[0].action, "ERROR");
  assert.equal(bot.state.decisions[0].error, "boom");
  assert.equal(bot.state.account.trades.length, 0);
});

test("rules provider returns a valid decision shape", async () => {
  const d = await rulesProvider.decide({
    indicators: { price: 100, ema20: 99, ema50: 95, rsi14: 60, macd_hist: 1, macd_hist_prev: 0.5, atr_pct: 1.2, trend: "uptrend" },
    position: null,
    settings: { maxStopLossPct: 10 },
  });
  assert.equal(d.action, "BUY");
  assert.ok(d.stop_loss_pct > 0 && d.take_profit_pct > d.stop_loss_pct);
});

// Fake Anthropic client: checks the request shape without calling the real API.
function fakeClaude(response) {
  const calls = [];
  return {
    calls,
    beta: { messages: { parse: async (params) => (calls.push(params), response) } },
  };
}

const ctx = {
  symbol: "BTCUSDT",
  interval: "1h",
  candles: [{ time: 1_700_000_000, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
  indicators: { price: 1 },
  position: null,
  account: { equity: 1000, cash: 1000, exposure: 0, positions: [] },
  settings: { maxPositionPct: 25, maxTotalExposurePct: 80, minConfidence: 0.6, maxStopLossPct: 10, feeRate: 0.001 },
};

test("Claude provider sends structured-output request and returns parsed decision", async () => {
  const client = fakeClaude({
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 1000, output_tokens: 200 },
    parsed_output: { action: "HOLD", confidence: 0.4, size_pct: 0, stop_loss_pct: 0, take_profit_pct: 0, reasoning: "รอ" },
  });
  const provider = createClaudeProvider({ model: "claude-opus-5-5", effort: "medium", client });
  const d = await provider.decide(ctx);
  assert.equal(d.action, "HOLD");
  assert.equal(d.source, "claude");
  assert.ok(Math.abs(d.costUsd - (1000 * 4 + 200 * 20) / 1e6) < 1e-12);
  const req = client.calls[0];
  assert.equal(req.model, "claude-opus-5-5");
  assert.equal(req.output_config.effort, "medium");
  assert.equal(req.output_config.format.type, "json_schema");
  assert.equal(req.fallbacks, "default");
});

test("Claude refusal becomes a HOLD", async () => {
  const client = fakeClaude({ model: "claude-opus-5-5", stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 0 }, parsed_output: null });
  const d = await createClaudeProvider({ model: "claude-opus-5-5", effort: "low", client }).decide(ctx);
  assert.equal(d.action, "HOLD");
});

test("API validates settings and exposes state", async () => {
  const { bot } = makeBot(rulesProvider, { BTCUSDT: 100 });
  const server = createApp(bot).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const bad = await fetch(`${base}/api/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxPositionPct: 500 }) });
    assert.equal(bad.status, 400);
    const unknown = await fetch(`${base}/api/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: "x" }) });
    assert.equal(unknown.status, 400);
    const ok = await fetch(`${base}/api/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxPositionPct: 30, symbols: ["BTCUSDT"] }) });
    assert.equal(ok.status, 200);
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.settings.maxPositionPct, 30);
    assert.equal(state.mode, "paper");
  } finally {
    server.close();
    bot.shutdown();
  }
});

test("dashboard password is enforced when set", async () => {
  const { bot } = makeBot(rulesProvider, { BTCUSDT: 100 });
  const server = createApp(bot, { password: "s3cret" }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    const auth = { Authorization: `Basic ${Buffer.from("admin:s3cret").toString("base64")}` };
    assert.equal((await fetch(`${base}/api/state`, { headers: auth })).status, 200);
  } finally {
    server.close();
    bot.shutdown();
  }
});
