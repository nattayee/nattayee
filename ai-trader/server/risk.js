// Risk manager: every AI decision passes through here before an order is placed.
// The AI suggests; these hard limits decide what actually happens.

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

export const MIN_ORDER_NOTIONAL = 10; // USDT

export function applyRisk(decision, { symbol, price, portfolio, settings, killSwitchActive = false }) {
  const notes = [];
  const reject = (why) => ({ approved: false, action: "HOLD", notes: [...notes, why] });
  const action = decision.action;
  const confidence = clamp(num(decision.confidence, 0), 0, 1);
  const position = portfolio.positions[symbol];

  if (action === "HOLD") return { approved: false, action: "HOLD", notes: ["AI แนะนำให้ถือ/รอ"] };
  if (!(price > 0)) return reject("ไม่มีราคาล่าสุด");
  if (confidence < settings.minConfidence) {
    return reject(`ความมั่นใจ ${(confidence * 100).toFixed(0)}% ต่ำกว่าเกณฑ์ ${(settings.minConfidence * 100).toFixed(0)}%`);
  }

  if (action === "BUY") {
    if (killSwitchActive) return reject("Kill switch ทำงาน (ขาดทุนวันนี้เกินกำหนด) — ไม่เปิดสถานะใหม่");
    if (position) return reject(`มี ${symbol} อยู่แล้ว — ไม่ซื้อเพิ่ม`);

    const equity = portfolio.equity();
    const sizePct = clamp(num(decision.size_pct, 50), 0, 100);
    let notional = equity * (settings.maxPositionPct / 100) * (sizePct / 100);
    const exposureRoom = equity * (settings.maxTotalExposurePct / 100) - portfolio.exposure();
    const cashRoom = portfolio.account.cash / (1 + settings.feeRate);

    if (notional > exposureRoom) {
      notes.push(`ลดขนาดตามเพดานสัดส่วนรวม ${settings.maxTotalExposurePct}%`);
      notional = exposureRoom;
    }
    if (notional > cashRoom) {
      notes.push("ลดขนาดตามเงินสดที่มี");
      notional = cashRoom;
    }
    if (notional < MIN_ORDER_NOTIONAL) return reject(`ขนาดคำสั่งต่ำกว่าขั้นต่ำ ${MIN_ORDER_NOTIONAL} USDT`);

    const slPct = clamp(num(decision.stop_loss_pct, settings.defaultStopLossPct), 0.5, settings.maxStopLossPct);
    const tpPct = clamp(num(decision.take_profit_pct, settings.defaultTakeProfitPct), 0.5, 100);
    if (slPct !== decision.stop_loss_pct) notes.push(`ปรับ Stop-loss เป็น ${slPct}%`);

    return {
      approved: true,
      action: "BUY",
      notional,
      stopLoss: price * (1 - slPct / 100),
      takeProfit: price * (1 + tpPct / 100),
      notes,
    };
  }

  if (action === "SELL") {
    if (!position) return reject(`ไม่มี ${symbol} ในพอร์ต (โหมด Spot ขายชอร์ตไม่ได้)`);
    const sizePct = clamp(num(decision.size_pct, 100), 1, 100);
    return { approved: true, action: "SELL", fraction: sizePct / 100, notes };
  }

  return reject(`คำสั่งไม่รู้จัก: ${action}`);
}
