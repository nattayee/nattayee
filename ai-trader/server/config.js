import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, "..");

const hasAnthropicCredentials = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
);

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  // Bind to localhost by default so the dashboard is not exposed to the network.
  host: process.env.HOST || "127.0.0.1",
  dashboardPassword: process.env.DASHBOARD_PASSWORD || "",

  // "claude" = Claude decides, "rules" = built-in indicator strategy (no API key needed).
  aiProvider: pick(
    process.env.AI_PROVIDER,
    ["claude", "rules"],
    hasAnthropicCredentials ? "claude" : "rules",
  ),
  claudeModel: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  claudeEffort: pick(
    process.env.CLAUDE_EFFORT,
    ["low", "medium", "high", "xhigh", "max"],
    "medium",
  ),

  // "auto" probes Binance at startup and falls back to a simulated feed if unreachable.
  marketData: pick(process.env.MARKET_DATA, ["auto", "binance", "simulated"], "auto"),
  binanceBaseUrl: process.env.BINANCE_BASE_URL || "https://data-api.binance.vision",

  dataDir: path.resolve(ROOT_DIR, process.env.DATA_DIR || "data"),
  priceTickSeconds: Number(process.env.PRICE_TICK_SECONDS) || 15,
};

// Defaults for settings the user can change from the dashboard (persisted in state.json).
export const DEFAULT_SETTINGS = {
  symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  candleInterval: "1h",
  decisionIntervalMin: 60, // matches 1h candles; deciding more often mostly re-reads the same data
  startingBalance: 10000,
  feeRate: 0.001, // 0.1% per side, similar to Binance spot
  maxPositionPct: 25, // max % of equity in a single coin
  maxTotalExposurePct: 80, // max % of equity in coins overall
  minConfidence: 0.6, // AI confidence required before acting
  defaultStopLossPct: 3,
  defaultTakeProfitPct: 6,
  maxStopLossPct: 10,
  maxDailyLossPct: 5, // kill switch: pause the bot after losing this much in one day
};
