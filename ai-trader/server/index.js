import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import express from "express";
import { z } from "zod";
import { config, ROOT_DIR } from "./config.js";
import { createMarketFeed, INTERVAL_MS } from "./market.js";
import { createClaudeProvider, rulesProvider } from "./ai.js";
import { Store } from "./store.js";
import { TradingBot } from "./bot.js";

const require = createRequire(import.meta.url);

const SymbolSchema = z.string().regex(/^[A-Z0-9]{5,20}$/, "ชื่อคู่เทรดต้องเป็นตัวพิมพ์ใหญ่ เช่น BTCUSDT");
const SettingsPatch = z
  .object({
    symbols: z.array(SymbolSchema).min(1).max(10),
    candleInterval: z.enum(Object.keys(INTERVAL_MS)),
    decisionIntervalMin: z.number().int().min(1).max(1440),
    feeRate: z.number().min(0).max(0.01),
    maxPositionPct: z.number().min(1).max(100),
    maxTotalExposurePct: z.number().min(1).max(100),
    minConfidence: z.number().min(0).max(1),
    defaultStopLossPct: z.number().min(0.5).max(50),
    defaultTakeProfitPct: z.number().min(0.5).max(500),
    maxStopLossPct: z.number().min(0.5).max(50),
    maxDailyLossPct: z.number().min(0.5).max(100),
  })
  .partial()
  .strict();

function basicAuth(password) {
  const expected = Buffer.from(password);
  return (req, res, next) => {
    const header = req.headers.authorization ?? "";
    const [scheme, encoded] = header.split(" ");
    const supplied = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : "";
    const given = Buffer.from(supplied);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return next();
    res.set("WWW-Authenticate", 'Basic realm="AI Crypto Trader"').status(401).send("Authentication required");
  };
}

export function createApp(bot, { password = "" } = {}) {
  const app = express();
  app.use(express.json());
  if (password) app.use(basicAuth(password));

  app.use(express.static(path.join(ROOT_DIR, "public")));
  const chartsLib = path.join(path.dirname(require.resolve("lightweight-charts")), "dist", "lightweight-charts.standalone.production.js");
  app.get("/vendor/lightweight-charts.js", (_req, res) => res.sendFile(chartsLib));

  const wrap = (fn) => async (req, res) => {
    try {
      res.json((await fn(req, res)) ?? { ok: true });
    } catch (err) {
      const status = err instanceof z.ZodError ? 400 : err.status ?? 400;
      const message = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message;
      res.status(status).json({ error: message });
    }
  };

  app.get("/api/state", wrap(() => ({
    mode: "paper",
    bot: bot.status(),
    settings: bot.settings,
    portfolio: bot.portfolio.snapshot(),
    prices: bot.portfolio.prices,
    day: bot.state.day,
    trades: bot.state.account.trades.slice(0, 100),
    decisions: bot.state.decisions.slice(0, 60),
    equityHistory: bot.state.equityHistory,
    aiUsage: bot.state.aiUsage,
  })));

  app.get("/api/candles", wrap(async (req) => {
    const symbol = SymbolSchema.parse(req.query.symbol);
    const interval = z.enum(Object.keys(INTERVAL_MS)).parse(req.query.interval ?? bot.settings.candleInterval);
    const candles = await bot.market.getCandles(symbol, interval, 300);
    const trades = bot.state.account.trades.filter((t) => t.symbol === symbol).slice(0, 100);
    return { symbol, interval, candles, trades };
  }));

  app.post("/api/bot/start", wrap(() => bot.start()));
  app.post("/api/bot/stop", wrap(() => bot.stop()));
  app.post("/api/bot/run", wrap(async () => {
    if (bot.cycleRunning) throw new Error("บอทกำลังวิเคราะห์อยู่แล้ว");
    bot.runCycle().catch(() => {}); // runs in the background; the dashboard polls for results
    return { ok: true, started: true };
  }));

  app.put("/api/settings", wrap(async (req) => {
    const patch = SettingsPatch.parse(req.body);
    if (patch.symbols) {
      const invalid = [];
      for (const s of patch.symbols) if (!(await bot.market.isValidSymbol(s))) invalid.push(s);
      if (invalid.length) throw new Error(`ไม่พบคู่เทรด: ${invalid.join(", ")}`);
    }
    bot.updateSettings(patch);
    return { ok: true, settings: bot.settings };
  }));

  app.post("/api/positions/:symbol/close", wrap((req) => ({ ok: true, trade: bot.closePosition(SymbolSchema.parse(req.params.symbol)) })));

  app.post("/api/account/reset", wrap((req) => {
    const startingBalance = z.number().min(100).max(1e9).optional().parse(req.body?.startingBalance);
    bot.resetAccount(startingBalance);
  }));

  return app;
}

async function main() {
  const market = await createMarketFeed({ mode: config.marketData, baseUrl: config.binanceBaseUrl });
  const provider =
    config.aiProvider === "claude"
      ? createClaudeProvider({ model: config.claudeModel, effort: config.claudeEffort })
      : rulesProvider;
  const store = new Store(config.dataDir);
  const bot = new TradingBot({ store, market, provider, priceTickSeconds: config.priceTickSeconds });
  await bot.init();

  const app = createApp(bot, { password: config.dashboardPassword });
  const server = app.listen(config.port, config.host, () => {
    console.log(`AI Crypto Trader → http://${config.host}:${config.port}`);
    console.log(`  โหมด: Paper trading (เงินจำลอง) | ราคา: ${market.name} | ผู้ตัดสินใจ: ${provider.label}`);
    if (config.host !== "127.0.0.1" && config.host !== "localhost" && !config.dashboardPassword) {
      console.warn("  ⚠️  เปิดให้เครือข่ายเข้าถึงได้แต่ยังไม่ได้ตั้ง DASHBOARD_PASSWORD — ใครก็ควบคุมบอทได้");
    }
  });

  const shutdown = () => {
    bot.shutdown();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT_DIR, "server/index.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
