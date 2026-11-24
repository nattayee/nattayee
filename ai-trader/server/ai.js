// Decision makers. Each provider takes a market/account context and returns
// { action, confidence, size_pct, stop_loss_pct, take_profit_pct, reasoning }.
// Decisions are suggestions only — risk.js enforces the hard limits.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const DecisionSchema = z.object({
  action: z.enum(["BUY", "SELL", "HOLD"]),
  confidence: z.number().describe("0.0 - 1.0"),
  size_pct: z
    .number()
    .describe("BUY: % of the max allowed position size to use. SELL: % of the current position to sell. HOLD: 0"),
  stop_loss_pct: z.number().describe("BUY only: stop-loss distance below entry in %, e.g. 3 = 3%"),
  take_profit_pct: z.number().describe("BUY only: take-profit distance above entry in %"),
  reasoning: z.string().describe("2-4 short sentences in Thai explaining the decision"),
});

const SYSTEM_PROMPT = `You are the decision engine of a crypto trading bot that trades a SPOT account.
The account can only BUY a coin with USDT or SELL coins it already holds — no shorting, no leverage.

Your job: given recent candles, technical indicators, the current position and account state for ONE symbol,
choose exactly one action:
- BUY: open a new position (only when there is no position in this symbol).
- SELL: reduce or close the existing position (only when there is a position).
- HOLD: do nothing.

Principles:
- Capital preservation comes first. HOLD is the right answer most of the time; only trade with a clear edge.
- Prefer trading with the prevailing trend; be skeptical of catching falling knives or chasing spikes.
- Base stop-loss on volatility (ATR %), typically 1-3x ATR %. Take-profit should give at least ~1.5:1 reward/risk.
- For an open position, consider whether the original thesis still holds; cut losers decisively, let winners run.
- confidence is your honest probability that the trade works out, not enthusiasm. Orders below the account's
  minimum confidence are ignored, so do not inflate it.
- The account's hard risk limits are enforced after you answer; you cannot override them.
- Write "reasoning" in Thai, 2-4 short sentences, citing the specific indicators that drove the decision.`;

function formatCandles(candles, n = 48) {
  const rows = candles.slice(-n).map((c) =>
    [new Date(c.time * 1000).toISOString().slice(0, 16), c.open, c.high, c.low, c.close, Math.round(c.volume)].join(","),
  );
  return ["time_utc,open,high,low,close,volume", ...rows].join("\n");
}

export function buildPrompt(ctx) {
  const { symbol, interval, candles, indicators, position, account, settings } = ctx;
  const positionText = position
    ? JSON.stringify({
        qty: position.qty,
        entry_price: position.entryPrice,
        current_price: indicators.price,
        unrealized_pnl_pct: Number((((indicators.price * position.qty - position.cost) / position.cost) * 100).toFixed(2)),
        stop_loss: position.stopLoss,
        take_profit: position.takeProfit,
        held_hours: Number(((Date.now() - position.openedAt) / 3_600_000).toFixed(1)),
      })
    : "none";

  return `Symbol: ${symbol}  Timeframe: ${interval}

Indicators (latest candle):
${JSON.stringify(indicators, null, 2)}

Recent candles:
${formatCandles(candles)}

Current position in ${symbol}: ${positionText}

Account: ${JSON.stringify({
    equity_usdt: Number(account.equity.toFixed(2)),
    cash_usdt: Number(account.cash.toFixed(2)),
    exposure_pct: Number(((account.exposure / account.equity) * 100).toFixed(1)),
    open_positions: account.positions.map((p) => p.symbol),
  })}

Risk limits: max ${settings.maxPositionPct}% of equity per coin, max ${settings.maxTotalExposurePct}% total exposure,
min confidence ${settings.minConfidence}, max stop-loss ${settings.maxStopLossPct}%, fee ${(settings.feeRate * 100).toFixed(2)}% per side.

Decide BUY, SELL or HOLD for ${symbol}.`;
}

// Approximate USD prices per 1M tokens (input, output) for the dashboard's cost estimate.
const PRICING = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};

export function estimateCostUsd(model, usage) {
  const p = PRICING[model];
  if (!p || !usage) return null;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * p[0] + (usage.output_tokens ?? 0) * p[1]) / 1_000_000;
}

export function createClaudeProvider({ model, effort, client = new Anthropic() }) {
  return {
    name: "claude",
    label: `Claude (${model})`,
    async decide(ctx) {
      let response;
      try {
        response = await client.beta.messages.parse({
          model,
          max_tokens: 16000,
          // If Claude declines for policy reasons, let the API retry on its recommended fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort, format: betaZodOutputFormat(DecisionSchema) },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildPrompt(ctx) }],
        });
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError) {
          throw new Error("ANTHROPIC_API_KEY ไม่ถูกต้อง — ตรวจสอบไฟล์ .env");
        }
        if (err instanceof Anthropic.RateLimitError) {
          throw new Error("Claude API rate limit — จะลองใหม่ในรอบถัดไป");
        }
        if (err instanceof Anthropic.APIError) {
          throw new Error(`Claude API error ${err.status ?? ""}: ${err.message}`);
        }
        throw err;
      }

      const usage = response.usage;
      const meta = { source: "claude", model: response.model, usage, costUsd: estimateCostUsd(response.model, usage) };

      if (response.stop_reason === "refusal") {
        return { ...holdDecision("Claude ปฏิเสธที่จะตอบคำขอนี้ — ถือไว้ก่อน"), ...meta };
      }
      if (!response.parsed_output) {
        throw new Error(`Claude ไม่ได้ส่งผลลัพธ์ที่อ่านได้ (stop_reason: ${response.stop_reason})`);
      }
      return { ...response.parsed_output, ...meta };
    },
  };
}

function holdDecision(reasoning) {
  return { action: "HOLD", confidence: 0, size_pct: 0, stop_loss_pct: 0, take_profit_pct: 0, reasoning };
}

// Built-in strategy used when no API key is configured: EMA trend + MACD momentum + RSI filter.
export const rulesProvider = {
  name: "rules",
  label: "กลยุทธ์ indicator (ไม่ใช้ AI)",
  async decide({ indicators: ind, position, settings }) {
    const base = { source: "rules", model: null, usage: null, costUsd: null };
    if (ind.ema20 == null || ind.ema50 == null || ind.rsi14 == null || ind.macd_hist == null) {
      return { ...holdDecision("ข้อมูลแท่งเทียนยังไม่พอคำนวณ indicator"), ...base };
    }
    const slPct = Math.min(Math.max((ind.atr_pct ?? 1.5) * 2, 1), settings.maxStopLossPct);

    if (!position) {
      const bullish = ind.ema20 > ind.ema50 && ind.price > ind.ema20 && ind.macd_hist > 0;
      if (bullish && ind.rsi14 >= 45 && ind.rsi14 <= 70) {
        const confidence = Math.min(0.6 + (ind.macd_hist_prev != null && ind.macd_hist > ind.macd_hist_prev ? 0.1 : 0), 0.75);
        return {
          ...base,
          action: "BUY",
          confidence,
          size_pct: 60,
          stop_loss_pct: Number(slPct.toFixed(2)),
          take_profit_pct: Number((slPct * 2).toFixed(2)),
          reasoning: `แนวโน้มขาขึ้น: ราคาอยู่เหนือ EMA20 และ EMA20 > EMA50, MACD histogram เป็นบวก, RSI ${ind.rsi14} ยังไม่ overbought`,
        };
      }
      return { ...holdDecision(`ยังไม่มีสัญญาณซื้อชัดเจน (เทรนด์: ${ind.trend}, RSI ${ind.rsi14})`), ...base };
    }

    if (ind.rsi14 > 78) {
      return { ...base, action: "SELL", confidence: 0.7, size_pct: 50, stop_loss_pct: 0, take_profit_pct: 0, reasoning: `RSI ${ind.rsi14} overbought มาก — ขายทำกำไรครึ่งหนึ่ง` };
    }
    if (ind.ema20 < ind.ema50 && ind.macd_hist < 0) {
      return { ...base, action: "SELL", confidence: 0.7, size_pct: 100, stop_loss_pct: 0, take_profit_pct: 0, reasoning: "EMA20 ตัดลงใต้ EMA50 และ MACD เป็นลบ — แนวโน้มเปลี่ยน ปิดสถานะ" };
    }
    return { ...holdDecision(`ถือสถานะต่อ (เทรนด์: ${ind.trend}, RSI ${ind.rsi14})`), ...base };
  },
};
