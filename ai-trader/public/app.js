/* global LightweightCharts */
const $ = (sel) => document.querySelector(sel);

let state = null;
let selectedSymbol = null;
let chart, candleSeries, equityChart, equitySeries;
let lastEquityLen = -1;

// ---------- formatting ----------
const usd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => (v == null ? "–" : usd.format(v));
const fmtSigned = (v) => (v == null ? "–" : (v >= 0 ? "+" : "") + usd.format(v));
const fmtPct = (v) => (v == null || !isFinite(v) ? "–" : (v >= 0 ? "+" : "") + v.toFixed(2) + "%");
function fmtPrice(v) {
  if (v == null) return "–";
  const d = v >= 1000 ? 2 : v >= 1 ? 4 : 6;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const fmtQty = (v) => (v >= 1 ? v.toFixed(4) : v.toPrecision(4));
const cls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");
const fmtTime = (ms) => new Date(ms).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "เมื่อสักครู่";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return fmtTime(ms);
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ACTION_TH = { BUY: "ซื้อ", SELL: "ขาย", HOLD: "ถือ/รอ", ERROR: "ผิดพลาด" };
// lightweight-charts shows UTC; shift timestamps so the axis reads in the viewer's local time.
const TZ_SHIFT = -new Date().getTimezoneOffset() * 60;

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showAlert(msg) {
  const el = $("#alert");
  el.hidden = !msg;
  el.textContent = msg || "";
}

// ---------- charts ----------
const chartOptions = {
  autoSize: true,
  layout: { background: { type: "solid", color: "transparent" }, textColor: "#8b97ad", fontFamily: "JetBrains Mono, monospace" },
  grid: { vertLines: { color: "rgba(33,43,61,0.6)" }, horzLines: { color: "rgba(33,43,61,0.6)" } },
  rightPriceScale: { borderColor: "#212b3d" },
  timeScale: { borderColor: "#212b3d", timeVisible: true, secondsVisible: false },
  crosshair: { mode: 0 },
};

function initCharts() {
  chart = LightweightCharts.createChart($("#chart"), chartOptions);
  candleSeries = chart.addCandlestickSeries({
    upColor: "#22c55e", downColor: "#f05252", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#f05252",
  });
  equityChart = LightweightCharts.createChart($("#equity-chart"), chartOptions);
  equitySeries = equityChart.addAreaSeries({
    lineColor: "#7c6cf6", topColor: "rgba(124,108,246,0.35)", bottomColor: "rgba(124,108,246,0.02)", lineWidth: 2,
  });
}

async function loadCandles() {
  if (!selectedSymbol) return;
  const sym = selectedSymbol;
  try {
    const data = await api(`/api/candles?symbol=${sym}`);
    if (sym !== selectedSymbol) return;
    const candles = data.candles.map((c) => ({ ...c, time: c.time + TZ_SHIFT }));
    candleSeries.setData(candles);
    candleSeries.applyOptions({ priceFormat: { type: "price", precision: priceDecimals(candles.at(-1)?.close), minMove: 10 ** -priceDecimals(candles.at(-1)?.close) } });

    // Snap each trade to the candle it happened in so markers line up with bars.
    const times = candles.map((c) => c.time);
    const markers = data.trades
      .map((t) => {
        const tt = Math.floor(t.time / 1000) + TZ_SHIFT;
        let idx = times.findLastIndex((x) => x <= tt);
        if (idx < 0) return null;
        const buy = t.side === "BUY";
        return { time: times[idx], position: buy ? "belowBar" : "aboveBar", color: buy ? "#22c55e" : "#f05252", shape: buy ? "arrowUp" : "arrowDown", text: buy ? "ซื้อ" : "ขาย" };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);
    candleSeries.setMarkers(markers);
    $("#chart-interval").textContent = data.interval;
  } catch (err) {
    showAlert(`โหลดกราฟไม่ได้: ${err.message}`);
  }
}
const priceDecimals = (v) => (v == null ? 2 : v >= 1000 ? 2 : v >= 1 ? 4 : 6);

function renderEquity() {
  const hist = state.equityHistory;
  if (hist.length === lastEquityLen) return;
  lastEquityLen = hist.length;
  const seen = new Set();
  const points = [];
  for (const p of hist) {
    const t = Math.floor(p.time / 1000) + TZ_SHIFT;
    if (seen.has(t)) continue;
    seen.add(t);
    points.push({ time: t, value: p.equity });
  }
  equitySeries.setData(points);
  equityChart.timeScale().fitContent();
}

// ---------- render ----------
function render() {
  const { bot, portfolio: p, settings, aiUsage, day } = state;

  // header
  const mb = $("#badge-market");
  mb.textContent = bot.marketSource === "binance" ? "ราคา: Binance (จริง)" : "ราคา: จำลอง (offline)";
  mb.classList.toggle("badge-sim", bot.marketSource !== "binance");
  $("#badge-ai").textContent = `ผู้ตัดสินใจ: ${bot.provider.label}`;

  const st = $("#bot-status");
  st.classList.toggle("on", bot.running && !bot.cycleRunning);
  st.classList.toggle("busy", bot.cycleRunning);
  st.querySelector(".label").textContent = bot.cycleRunning
    ? `กำลังวิเคราะห์ ${bot.currentSymbol ?? ""}…`
    : bot.running ? "บอทกำลังทำงาน" : "บอทหยุดอยู่";
  const toggle = $("#btn-toggle");
  toggle.textContent = bot.running ? "■ หยุดบอท" : "▶ เริ่มบอท";
  toggle.classList.toggle("stop", bot.running);
  $("#btn-run").disabled = bot.cycleRunning;

  $("#next-run").textContent = bot.running && bot.nextRunAt
    ? `รอบถัดไป ${new Date(bot.nextRunAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`
    : `ทุก ${settings.decisionIntervalMin} นาทีเมื่อเปิดบอท`;

  if (bot.killSwitch?.active) showAlert(`⛔ Kill switch: ${bot.killSwitch.reason} — บอทถูกหยุดอัตโนมัติ (จะปลดล็อกเมื่อขึ้นวันใหม่ หรือรีเซ็ตบัญชี)`);
  else if (bot.lastError) showAlert(`ข้อผิดพลาดล่าสุด (${bot.lastError.where}): ${bot.lastError.message}`);
  else showAlert("");

  // stats
  $("#st-equity").textContent = fmtUsd(p.equity);
  $("#st-equity-sub").textContent = `เริ่มต้น ${fmtUsd(p.startingBalance)}`;
  $("#st-cash").textContent = fmtUsd(p.cash);
  $("#st-exposure").textContent = `ถือเหรียญ ${((p.exposure / p.equity) * 100).toFixed(1)}% ของพอร์ต`;
  const pnl = $("#st-pnl");
  pnl.textContent = fmtSigned(p.totalPnl);
  pnl.className = `stat-value ${cls(p.totalPnl)}`;
  $("#st-pnl-sub").textContent = `${fmtPct(p.totalPnlPct)} · ค่าธรรมเนียม ${fmtUsd(p.feesPaid)}`;
  const dayPnl = day ? p.equity - day.startEquity : null;
  const dEl = $("#st-day");
  dEl.textContent = fmtSigned(dayPnl);
  dEl.className = `stat-value ${cls(dayPnl)}`;
  $("#st-day-sub").textContent = day ? `${fmtPct((dayPnl / day.startEquity) * 100)} · เพดาน -${settings.maxDailyLossPct}%` : "";
  $("#st-ai").textContent = bot.provider.name === "claude" ? `$${aiUsage.costUsd.toFixed(3)}` : "ฟรี";
  $("#st-ai-sub").textContent = bot.provider.name === "claude"
    ? `${aiUsage.calls} ครั้ง · ${((aiUsage.inputTokens + aiUsage.outputTokens) / 1000).toFixed(1)}k tokens`
    : "ใช้กลยุทธ์ indicator";

  renderTabs();
  renderPositions();
  renderTrades();
  renderDecisions();
  renderEquity();
  const price = state.prices[selectedSymbol];
  $("#chart-price").textContent = `${selectedSymbol ?? ""} ${fmtPrice(price)}`;
}

function renderTabs() {
  const symbols = [...new Set([...state.settings.symbols, ...state.portfolio.positions.map((x) => x.symbol)])];
  if (!selectedSymbol || !symbols.includes(selectedSymbol)) {
    selectedSymbol = symbols[0];
    loadCandles();
  }
  const held = new Set(state.portfolio.positions.map((x) => x.symbol));
  const html = symbols
    .map((s) => `<button class="tab ${s === selectedSymbol ? "active" : ""}" data-symbol="${esc(s)}" role="tab">${esc(s.replace(/USDT$/, ""))}${held.has(s) ? '<span class="held">●</span>' : ""}</button>`)
    .join("");
  const tabs = $("#symbol-tabs");
  if (tabs.innerHTML !== html) tabs.innerHTML = html;
}

function renderPositions() {
  const rows = state.portfolio.positions;
  $("#positions").innerHTML = rows.length
    ? rows
        .map((x) => `<tr>
          <td><b>${esc(x.symbol)}</b></td>
          <td class="num">${fmtQty(x.qty)}</td>
          <td class="num">${fmtPrice(x.entryPrice)}</td>
          <td class="num">${fmtPrice(x.price)}</td>
          <td class="num">${fmtUsd(x.value)}</td>
          <td class="num ${cls(x.unrealizedPnl)}">${fmtSigned(x.unrealizedPnl)}<br><span class="small">${fmtPct(x.unrealizedPnlPct)}</span></td>
          <td class="num small"><span class="down">${fmtPrice(x.stopLoss)}</span><br><span class="up">${fmtPrice(x.takeProfit)}</span></td>
          <td><button class="btn btn-sm btn-danger" data-close="${esc(x.symbol)}">ปิด</button></td>
        </tr>`)
        .join("")
    : `<tr><td colspan="8" class="empty">ยังไม่มีเหรียญในพอร์ต — รอให้ AI หาจังหวะเข้า</td></tr>`;
}

function renderTrades() {
  const rows = state.trades;
  $("#trades").innerHTML = rows.length
    ? rows
        .slice(0, 50)
        .map((t) => `<tr>
          <td class="small">${fmtTime(t.time)}</td>
          <td>${esc(t.symbol)}</td>
          <td><span class="side side-${t.side}">${ACTION_TH[t.side]}</span></td>
          <td class="num">${fmtPrice(t.price)}</td>
          <td class="num">${fmtUsd(t.notional)}</td>
          <td class="num ${cls(t.pnl)}">${t.pnl == null ? "–" : fmtSigned(t.pnl)}</td>
          <td class="reason">${esc(t.reason)}</td>
        </tr>`)
        .join("")
    : `<tr><td colspan="7" class="empty">ยังไม่มีการเทรด</td></tr>`;
}

function renderDecisions() {
  const list = state.decisions;
  $("#decisions").innerHTML = list.length
    ? list
        .map((d) => {
          const conf = Math.round((d.confidence ?? 0) * 100);
          const detail = d.action === "BUY" ? ` · ขนาด ${d.sizePct}% · SL ${d.stopLossPct}% · TP ${d.takeProfitPct}%`
            : d.action === "SELL" ? ` · ขาย ${d.sizePct}% ของที่ถือ` : "";
          return `<div class="decision">
            <div class="decision-head">
              <span class="sym">${esc(d.symbol)}</span>
              <span class="action action-${esc(d.action)}">${ACTION_TH[d.action] ?? esc(d.action)}</span>
              ${d.executed ? '<span class="exec">✓ ส่งคำสั่งแล้ว</span>' : d.action === "BUY" || d.action === "SELL" ? '<span class="noexec">ไม่ผ่านเกณฑ์</span>' : ""}
              <span class="time" title="${esc(new Date(d.time).toLocaleString("th-TH"))}">${timeAgo(d.time)}</span>
            </div>
            ${d.error ? `<div class="err">${esc(d.error)}</div>` : `
            <div class="conf">ความมั่นใจ <div class="conf-bar"><span style="width:${conf}%"></span></div> ${conf}%</div>
            <p>${esc(d.reasoning)}</p>
            <div class="notes">@ ${fmtPrice(d.price)}${detail}${d.notes?.length ? " · " + esc(d.notes.join(" · ")) : ""}</div>`}
          </div>`;
        })
        .join("")
    : `<div class="empty">ยังไม่มีการตัดสินใจ<br>กด “⚡ วิเคราะห์ตอนนี้” หรือ “▶ เริ่มบอท”</div>`;
}

// ---------- settings ----------
function openSettings() {
  const s = state.settings;
  const f = $("#settings-form");
  f.symbols.value = s.symbols.join(", ");
  f.candleInterval.value = s.candleInterval;
  f.decisionIntervalMin.value = s.decisionIntervalMin;
  f.maxPositionPct.value = s.maxPositionPct;
  f.maxTotalExposurePct.value = s.maxTotalExposurePct;
  f.minConfidencePct.value = Math.round(s.minConfidence * 100);
  f.maxDailyLossPct.value = s.maxDailyLossPct;
  f.defaultStopLossPct.value = s.defaultStopLossPct;
  f.maxStopLossPct.value = s.maxStopLossPct;
  f.defaultTakeProfitPct.value = s.defaultTakeProfitPct;
  f.feePct.value = +(s.feeRate * 100).toFixed(4);
  f.startingBalance.value = s.startingBalance;
  $("#settings-error").hidden = true;
  $("#settings-dialog").showModal();
}

async function saveSettings(e) {
  e.preventDefault();
  const f = e.target;
  const body = {
    symbols: f.symbols.value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean),
    candleInterval: f.candleInterval.value,
    decisionIntervalMin: Number(f.decisionIntervalMin.value),
    maxPositionPct: Number(f.maxPositionPct.value),
    maxTotalExposurePct: Number(f.maxTotalExposurePct.value),
    minConfidence: Number(f.minConfidencePct.value) / 100,
    maxDailyLossPct: Number(f.maxDailyLossPct.value),
    defaultStopLossPct: Number(f.defaultStopLossPct.value),
    maxStopLossPct: Number(f.maxStopLossPct.value),
    defaultTakeProfitPct: Number(f.defaultTakeProfitPct.value),
    feeRate: Number(f.feePct.value) / 100,
  };
  const btn = $("#settings-save");
  btn.disabled = true;
  try {
    await api("/api/settings", { method: "PUT", body });
    $("#settings-dialog").close();
    await refresh();
    loadCandles();
  } catch (err) {
    const el = $("#settings-error");
    el.textContent = err.message;
    el.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

// ---------- actions ----------
async function action(fn) {
  try {
    await fn();
    await refresh();
  } catch (err) {
    showAlert(err.message);
  }
}

function bindEvents() {
  $("#btn-toggle").addEventListener("click", () =>
    action(() => api(state.bot.running ? "/api/bot/stop" : "/api/bot/start", { method: "POST" })),
  );
  $("#btn-run").addEventListener("click", () => action(() => api("/api/bot/run", { method: "POST" })));
  $("#btn-settings").addEventListener("click", openSettings);
  $("#settings-cancel").addEventListener("click", () => $("#settings-dialog").close());
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#btn-reset").addEventListener("click", async () => {
    const amount = Number($("#settings-form").startingBalance.value);
    if (!confirm(`รีเซ็ตบัญชีจำลองและเริ่มใหม่ด้วย ${fmtUsd(amount)} USDT?\nประวัติทั้งหมดจะถูกลบ`)) return;
    await action(() => api("/api/account/reset", { method: "POST", body: { startingBalance: amount } }));
    lastEquityLen = -1;
    $("#settings-dialog").close();
    loadCandles();
  });
  $("#symbol-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-symbol]");
    if (!btn) return;
    selectedSymbol = btn.dataset.symbol;
    render();
    loadCandles();
  });
  $("#positions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close]");
    if (!btn) return;
    const sym = btn.dataset.close;
    if (confirm(`ปิดสถานะ ${sym} ทั้งหมดที่ราคาตลาด?`)) action(() => api(`/api/positions/${sym}/close`, { method: "POST" }));
  });
}

async function refresh() {
  try {
    state = await api("/api/state");
    render();
  } catch (err) {
    showAlert(`เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ${err.message}`);
  }
}

initCharts();
bindEvents();
await refresh();
setInterval(refresh, 4000);
setInterval(loadCandles, 20000);
