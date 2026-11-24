// The trading loop: fetch candles → indicators → AI decision → risk checks → paper order.
// A separate price tick keeps positions marked to market and enforces stop-loss / take-profit
// even while the decision loop is stopped.

import { summarize } from "./indicators.js";
import { applyRisk } from "./risk.js";
import { Portfolio, createAccount } from "./portfolio.js";

const localDate = (ms) => new Date(ms).toLocaleDateString("en-CA"); // YYYY-MM-DD in server's timezone
const EQUITY_SAMPLE_MS = 5 * 60_000;

export class TradingBot {
  constructor({ store, market, provider, log = console, now = () => Date.now(), priceTickSeconds = 15 }) {
    this.store = store;
    this.market = market;
    this.provider = provider;
    this.log = log;
    this.now = now;
    this.priceTickMs = priceTickSeconds * 1000;
    this.portfolio = new Portfolio(this.state.account, { feeRate: this.settings.feeRate, now });
    this.cycleRunning = false;
    this.currentSymbol = null;
    this.lastRunAt = null;
    this.nextRunAt = null;
    this.lastError = null;
    this.decisionTimer = null;
    this.tickTimer = null;
  }

  get state() {
    return this.store.state;
  }

  get settings() {
    return this.state.settings;
  }

  get running() {
    return this.state.botEnabled;
  }

  // Start background timers (price tick always; decision loop only if the bot was enabled).
  async init() {
    await this.tick().catch((err) => this.#error("price tick", err));
    this.tickTimer = setInterval(() => this.tick().catch((err) => this.#error("price tick", err)), this.priceTickMs);
    if (this.running) this.#scheduleNext(5_000);
  }

  shutdown() {
    clearInterval(this.tickTimer);
    clearTimeout(this.decisionTimer);
    this.store.flush();
  }

  start() {
    if (this.state.killSwitch.active) {
      throw new Error(`Kill switch ทำงานอยู่: ${this.state.killSwitch.reason} — รีเซ็ตได้ในหน้าตั้งค่า`);
    }
    this.state.botEnabled = true;
    this.store.save();
    this.#scheduleNext(0);
  }

  stop() {
    this.state.botEnabled = false;
    clearTimeout(this.decisionTimer);
    this.nextRunAt = null;
    this.store.save();
  }

  #scheduleNext(delayMs = this.settings.decisionIntervalMin * 60_000) {
    clearTimeout(this.decisionTimer);
    this.nextRunAt = this.now() + delayMs;
    this.decisionTimer = setTimeout(async () => {
      await this.runCycle().catch((err) => this.#error("decision cycle", err));
      if (this.running) this.#scheduleNext();
    }, delayMs);
  }

  #error(where, err) {
    this.lastError = { where, message: err.message, at: this.now() };
    this.log.error?.(`[bot] ${where}: ${err.message}`);
  }

  watchedSymbols() {
    return [...new Set([...this.settings.symbols, ...Object.keys(this.portfolio.positions)])];
  }

  // Refresh prices, enforce stops, track daily P/L and the kill switch.
  async tick() {
    const prices = await this.market.getPrices(this.watchedSymbols());
    this.portfolio.setPrices(prices);

    for (const hit of this.portfolio.triggeredStops()) {
      const label = hit.kind === "STOP_LOSS" ? "ชน Stop-loss" : "ถึงเป้า Take-profit";
      const trade = this.portfolio.sell(hit.symbol, 1, hit.price, { reason: label, source: "risk" });
      this.log.info?.(`[bot] ${hit.symbol} ${label} @ ${hit.price} (pnl ${trade.pnl.toFixed(2)})`);
    }

    const now = this.now();
    const equity = this.portfolio.equity();
    const today = localDate(now);
    if (!this.state.day || this.state.day.date !== today) {
      this.state.day = { date: today, startEquity: equity };
      if (this.state.killSwitch.active && this.state.killSwitch.kind === "daily_loss") {
        this.state.killSwitch = { active: false, reason: null, at: null };
      }
    }

    const dayLossPct = ((this.state.day.startEquity - equity) / this.state.day.startEquity) * 100;
    if (!this.state.killSwitch.active && dayLossPct >= this.settings.maxDailyLossPct) {
      this.state.killSwitch = {
        active: true,
        kind: "daily_loss",
        reason: `ขาดทุนวันนี้ ${dayLossPct.toFixed(2)}% เกินเพดาน ${this.settings.maxDailyLossPct}%`,
        at: now,
      };
      this.stop();
      this.log.warn?.(`[bot] KILL SWITCH: ${this.state.killSwitch.reason}`);
    }

    const hist = this.state.equityHistory;
    if (hist.length === 0 || now - hist[hist.length - 1].time >= EQUITY_SAMPLE_MS) {
      hist.push({ time: now, equity });
      if (hist.length > 2000) hist.splice(0, hist.length - 2000);
    }
    this.store.save();
  }

  // One decision round over every configured symbol.
  async runCycle() {
    if (this.cycleRunning) return { skipped: true };
    this.cycleRunning = true;
    this.lastRunAt = this.now();
    const results = [];
    try {
      for (const symbol of this.settings.symbols) {
        this.currentSymbol = symbol;
        results.push(await this.decideSymbol(symbol));
      }
      this.lastError = null;
    } finally {
      this.cycleRunning = false;
      this.currentSymbol = null;
      this.store.save();
    }
    return { results };
  }

  async decideSymbol(symbol) {
    const record = { id: `${this.now()}-${symbol}`, time: this.now(), symbol, executed: false, notes: [] };
    try {
      const candles = await this.market.getCandles(symbol, this.settings.candleInterval, 200);
      const indicators = summarize(candles);
      const price = indicators.price;
      this.portfolio.setPrices({ [symbol]: price });
      const snap = this.portfolio.snapshot();

      const decision = await this.provider.decide({
        symbol,
        interval: this.settings.candleInterval,
        candles,
        indicators,
        position: this.portfolio.positions[symbol] ?? null,
        account: snap,
        settings: this.settings,
      });
      this.#trackUsage(decision);

      Object.assign(record, {
        price,
        action: decision.action,
        confidence: decision.confidence,
        sizePct: decision.size_pct,
        stopLossPct: decision.stop_loss_pct,
        takeProfitPct: decision.take_profit_pct,
        reasoning: decision.reasoning,
        source: decision.source,
        model: decision.model,
        costUsd: decision.costUsd,
      });

      const risk = applyRisk(decision, {
        symbol,
        price,
        portfolio: this.portfolio,
        settings: this.settings,
        killSwitchActive: this.state.killSwitch.active,
      });
      record.notes = risk.notes;

      if (risk.approved && risk.action === "BUY") {
        const trade = this.portfolio.buy(symbol, risk.notional, price, {
          stopLoss: risk.stopLoss,
          takeProfit: risk.takeProfit,
          reason: decision.reasoning,
          source: decision.source,
        });
        Object.assign(record, { executed: true, tradeId: trade.id });
      } else if (risk.approved && risk.action === "SELL") {
        const trade = this.portfolio.sell(symbol, risk.fraction, price, { reason: decision.reasoning, source: decision.source });
        Object.assign(record, { executed: true, tradeId: trade.id });
      }
    } catch (err) {
      record.action = record.action ?? "ERROR";
      record.error = err.message;
      this.#error(`decide ${symbol}`, err);
    }

    this.state.decisions.unshift(record);
    if (this.state.decisions.length > 300) this.state.decisions.length = 300;
    return record;
  }

  #trackUsage(decision) {
    if (!decision.usage) return;
    const u = this.state.aiUsage;
    u.calls += 1;
    u.inputTokens += decision.usage.input_tokens ?? 0;
    u.outputTokens += decision.usage.output_tokens ?? 0;
    u.costUsd += decision.costUsd ?? 0;
  }

  updateSettings(patch) {
    Object.assign(this.settings, patch);
    this.portfolio.feeRate = this.settings.feeRate;
    if (this.running && patch.decisionIntervalMin != null && !this.cycleRunning) this.#scheduleNext();
    this.store.save();
  }

  closePosition(symbol) {
    const price = this.portfolio.prices[symbol];
    if (!this.portfolio.positions[symbol]) throw new Error(`ไม่มี ${symbol} ในพอร์ต`);
    return this.portfolio.sell(symbol, 1, price, { reason: "ปิดสถานะด้วยตนเอง", source: "manual" });
  }

  resetAccount(startingBalance = this.settings.startingBalance) {
    if (this.cycleRunning) throw new Error("บอทกำลังตัดสินใจอยู่ — ลองอีกครั้งในไม่กี่วินาที");
    this.stop();
    this.settings.startingBalance = startingBalance;
    this.state.account = createAccount(startingBalance);
    this.state.decisions = [];
    this.state.equityHistory = [];
    this.state.day = null;
    this.state.killSwitch = { active: false, reason: null, at: null };
    this.state.aiUsage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    const prices = this.portfolio.prices;
    this.portfolio = new Portfolio(this.state.account, { feeRate: this.settings.feeRate, now: this.now });
    this.portfolio.setPrices(prices);
    this.store.save();
  }

  status() {
    return {
      running: this.running,
      cycleRunning: this.cycleRunning,
      currentSymbol: this.currentSymbol,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.running ? this.nextRunAt : null,
      lastError: this.lastError,
      killSwitch: this.state.killSwitch,
      provider: { name: this.provider.name, label: this.provider.label },
      marketSource: this.market.name,
    };
  }
}
