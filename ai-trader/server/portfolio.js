// Paper-trading engine: spot only (long only, no leverage), fees charged on both sides.

const EPS = 1e-12;

export function createAccount(startingBalance) {
  return {
    startingBalance,
    cash: startingBalance,
    positions: {}, // symbol -> { qty, entryPrice, cost, openedAt, stopLoss, takeProfit }
    trades: [],
    realizedPnl: 0,
    feesPaid: 0,
  };
}

export class Portfolio {
  constructor(account, { feeRate = 0.001, now = () => Date.now() } = {}) {
    this.account = account;
    this.feeRate = feeRate;
    this.now = now;
    this.prices = {};
  }

  setPrices(prices) {
    Object.assign(this.prices, prices);
  }

  get positions() {
    return this.account.positions;
  }

  exposure() {
    return Object.entries(this.account.positions).reduce(
      (sum, [sym, p]) => sum + p.qty * (this.prices[sym] ?? p.entryPrice),
      0,
    );
  }

  equity() {
    return this.account.cash + this.exposure();
  }

  // Spend `notional` (in quote currency, e.g. USDT) on `symbol` at `price`.
  buy(symbol, notional, price, { stopLoss = null, takeProfit = null, reason = "", source = "" } = {}) {
    if (!(price > 0)) throw new Error(`Invalid price for ${symbol}`);
    const fee = notional * this.feeRate;
    if (notional <= 0 || notional + fee > this.account.cash + EPS) {
      throw new Error(`Not enough cash to buy ${symbol}`);
    }
    const qty = notional / price;
    this.account.cash -= notional + fee;
    this.account.feesPaid += fee;

    const pos = this.account.positions[symbol];
    if (pos) {
      const totalQty = pos.qty + qty;
      pos.entryPrice = (pos.entryPrice * pos.qty + price * qty) / totalQty;
      pos.qty = totalQty;
      pos.cost += notional + fee;
      if (stopLoss != null) pos.stopLoss = stopLoss;
      if (takeProfit != null) pos.takeProfit = takeProfit;
    } else {
      this.account.positions[symbol] = {
        qty,
        entryPrice: price,
        cost: notional + fee,
        openedAt: this.now(),
        stopLoss,
        takeProfit,
      };
    }
    this.prices[symbol] = price;
    return this.#record({ side: "BUY", symbol, qty, price, notional, fee, pnl: null, reason, source });
  }

  // Sell `fraction` (0..1] of the position at `price`.
  sell(symbol, fraction, price, { reason = "", source = "" } = {}) {
    const pos = this.account.positions[symbol];
    if (!pos) throw new Error(`No ${symbol} position to sell`);
    if (!(price > 0)) throw new Error(`Invalid price for ${symbol}`);
    const f = Math.min(Math.max(fraction, 0), 1);
    if (f <= 0) throw new Error("Sell fraction must be > 0");

    const qty = f >= 0.999 ? pos.qty : pos.qty * f;
    const notional = qty * price;
    const fee = notional * this.feeRate;
    const costPortion = pos.cost * (qty / pos.qty);
    const pnl = notional - fee - costPortion;

    this.account.cash += notional - fee;
    this.account.feesPaid += fee;
    this.account.realizedPnl += pnl;
    pos.qty -= qty;
    pos.cost -= costPortion;
    if (pos.qty <= EPS) delete this.account.positions[symbol];
    this.prices[symbol] = price;
    return this.#record({ side: "SELL", symbol, qty, price, notional, fee, pnl, reason, source });
  }

  // Returns positions whose stop-loss or take-profit has been hit at current prices.
  triggeredStops() {
    const hits = [];
    for (const [symbol, pos] of Object.entries(this.account.positions)) {
      const price = this.prices[symbol];
      if (price == null) continue;
      if (pos.stopLoss != null && price <= pos.stopLoss) hits.push({ symbol, price, kind: "STOP_LOSS" });
      else if (pos.takeProfit != null && price >= pos.takeProfit) hits.push({ symbol, price, kind: "TAKE_PROFIT" });
    }
    return hits;
  }

  #record(t) {
    const trade = { id: `${this.now()}-${Math.random().toString(36).slice(2, 8)}`, time: this.now(), ...t };
    this.account.trades.unshift(trade);
    if (this.account.trades.length > 500) this.account.trades.length = 500;
    return trade;
  }

  snapshot() {
    const positions = Object.entries(this.account.positions).map(([symbol, p]) => {
      const price = this.prices[symbol] ?? p.entryPrice;
      const value = p.qty * price;
      return {
        symbol,
        ...p,
        price,
        value,
        unrealizedPnl: value - p.cost,
        unrealizedPnlPct: ((value - p.cost) / p.cost) * 100,
      };
    });
    const equity = this.equity();
    return {
      startingBalance: this.account.startingBalance,
      cash: this.account.cash,
      equity,
      exposure: this.exposure(),
      totalPnl: equity - this.account.startingBalance,
      totalPnlPct: ((equity - this.account.startingBalance) / this.account.startingBalance) * 100,
      realizedPnl: this.account.realizedPnl,
      feesPaid: this.account.feesPaid,
      positions,
    };
  }
}
