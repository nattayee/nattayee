// Shared helpers for capturing RT Hub screenshots (demo mode) with the click targets' positions.
import fs from 'fs';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

// หน้า RT Hub ที่จะถ่าย: ตัวแปร RTHUB_PAGE หรือ medphys/index.html ของ repo นี้ · ภาพดิบ: MANUAL_RAW หรือ tools/capture/raw
const here = p => decodeURIComponent(new URL(p, import.meta.url).pathname);
// แถบเมนูตามที่แอดมินตั้ง (ชื่อ · ลำดับ · กลุ่ม): tools/nav.json (หรือ MANUAL_NAV) — ไม่มีไฟล์ = ใช้เมนูเริ่มต้นของโหมดตัวอย่าง
const NAV = (() => { try { return JSON.parse(fs.readFileSync(process.env.MANUAL_NAV || here('../nav.json'), 'utf8')); } catch (e) { return null; } })();
async function applyNav(page) {
  if (!NAV || !NAV.length) return;
  const KEY = 'medphys-dispatch:v1';
  await page.evaluate(() => (document.querySelector('.nav [data-view="settings"]') || document.querySelector('[data-view="settings"]')).click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#reset-demo').click());   // หน้าเว็บบันทึกข้อมูลตัวอย่างลง localStorage
  await page.waitForFunction(k => !!localStorage.getItem(k), KEY, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.evaluate(([k, nav]) => { const db = JSON.parse(localStorage.getItem(k)); db.config = Object.assign({}, db.config, { nav: nav.map(x => Object.assign({ on: true, guest: true }, x)) }); localStorage.setItem(k, JSON.stringify(db)); }, [KEY, NAV]);
  await page.reload();
  await page.waitForFunction(() => window.MEDPHYS_STARTED === true);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}
export const APP = 'file://' + (process.env.RTHUB_PAGE || here('../../../index.html'));
export const OUT = process.env.MANUAL_RAW || here('./raw');
export const DSF = 1.5;
fs.mkdirSync(OUT, { recursive: true });

const RECORDS = OUT + '/shots.json';
export function loadRecords() { try { return JSON.parse(fs.readFileSync(RECORDS, 'utf8')); } catch (e) { return {}; } }

/** A fresh demo: new browser context (empty storage → sample data), clock fixed at `when`, PIN 1234 for the admin. */
export async function open(when, opts = {}) {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY }, args: ['--lang=th'], env: { ...process.env, LANG: 'th_TH.UTF-8', LANGUAGE: 'th' } });   // date fields as วว/ดด/ปปปป
  const ctx = await browser.newContext({ viewport: { width: opts.width || 1440, height: opts.height || 940 }, deviceScaleFactor: DSF,
    locale: 'th-TH', timezoneId: 'Asia/Bangkok', ignoreHTTPSErrors: true, colorScheme: 'light' });
  await ctx.route(/^https?:\/\/(?!fonts\.(googleapis|gstatic)\.com)/, r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.clock.setFixedTime(new Date(when));
  await page.addInitScript(() => {
    if (!localStorage.getItem('medphys-dispatch:pin:admin')) localStorage.setItem('medphys-dispatch:pin:admin', '1c6d3vt');
    localStorage.setItem('medphys-pref:theme', '"light"');
  });
  await page.goto(APP);
  await page.waitForFunction(() => window.MEDPHYS_STARTED === true);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await applyNav(page);
  const records = loadRecords();
  const h = {
    page, browser, errs,
    async day(when) {   // move the clock to another day; storage stays
      await page.clock.setFixedTime(new Date(when));
      await page.reload();
      await page.waitForFunction(() => window.MEDPHYS_STARTED === true);
      await page.waitForTimeout(700);
    },
    async go(view) {
      await page.evaluate(v => { const b = document.querySelector(`.nav [data-view="${v}"], [data-view="${v}"]`); b.click(); }, view);
      await page.waitForTimeout(450);
      await page.evaluate(() => window.scrollTo(0, 0));
    },
    async pick(box, v) {
      const l = page.locator(`${box} label:has(input[value="${v}"])`).first();
      if (!(await l.locator('input').isChecked())) await l.click();
      await page.waitForTimeout(120);
    },
    async toast() { try { return (await page.textContent('#toast')).replace(/\s+/g, ' ').trim(); } catch (e) { return ''; } },
    async isOpen(id) { return page.evaluate(id => !!document.getElementById(id) && document.getElementById(id).open, id); },
    /**
     * Screenshot + where to click.
     * targets: selectors or locators, in click order (first match each)
     * area: 'viewport' | selector of the region to keep (dialog, card …) | {x,y,w,h} in CSS px
     * pad: margin around the area (CSS px) · top/bottom limits for a viewport crop
     */
    async snap(id, { targets = [], area = 'viewport', pad = 14, scrollTo = null, crop = null, note = '', keepToast = false, keepFocus = false, incl = [] } = {}) {
      // a picture shows the screen at rest: no caret / text selection, and no leftover message unless it is the point
      if (!keepFocus) await page.evaluate(() => { const a = document.activeElement; if (a && a.blur && a !== document.body) a.blur(); const s = getSelection(); if (s) s.removeAllRanges(); });
      if (!keepToast) await page.evaluate(() => { const t = document.getElementById('toast'); if (t) { try { t.hidePopover(); } catch (e) {} t.classList && t.classList.remove('show'); } });
      if (scrollTo) { await page.locator(scrollTo).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(250); }
      // a target may be { t: selector|locator, side: 'top'|'left'|'right'|'bottom'|… } to choose where its number goes
      const sides = targets.map(t => (t && t.t ? t.side || null : null));
      targets = targets.map(t => (t && t.t ? t.t : t));
      await page.waitForTimeout(150);
      const vp = page.viewportSize();
      let a;
      if (area === 'targets') {   // the region around the targets (scrolled into view), at least minW wide
        const first = typeof targets[0] === 'string' ? page.locator(targets[0]).first() : targets[0];
        await first.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(200);
        const bs = [];
        for (const t of targets) { const b = await (typeof t === 'string' ? page.locator(t).first() : t).boundingBox(); if (b) bs.push(b); }
        for (const t of incl) { const b = await (typeof t === 'string' ? page.locator(t).first() : t).boundingBox(); if (b) bs.push(b); }   // shown, not marked
        let x0 = Math.min(...bs.map(b => b.x)) - pad, y0 = Math.min(...bs.map(b => b.y)) - pad;
        let x1 = Math.max(...bs.map(b => b.x + b.width)) + pad, y1 = Math.max(...bs.map(b => b.y + b.height)) + pad;
        const minW = 760, minH = 260;
        if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
        if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
        if (x0 < 0) { x1 -= x0; x0 = 0; }
        a = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      }
      else if (area === 'viewport') a = { x: 0, y: 0, width: vp.width, height: vp.height };
      else if (typeof area === 'object') a = { x: area.x, y: area.y, width: area.w, height: area.h };
      else {
        const loc = page.locator(area).first();
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        a = await loc.boundingBox();
        if (!a) throw new Error(id + ': area not visible ' + area);
        a = { x: a.x - pad, y: a.y - pad, width: a.width + pad * 2, height: a.height + pad * 2 };
      }
      if (crop) a = { x: a.x + (crop.left || 0), y: a.y + (crop.top || 0), width: crop.w || a.width - (crop.left || 0), height: crop.h || a.height - (crop.top || 0) };
      // keep inside the viewport
      const x0 = Math.max(0, a.x), y0 = Math.max(0, a.y);
      const x1 = Math.min(vp.width, a.x + a.width), y1 = Math.min(vp.height, a.y + a.height);
      const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      const marks = [];
      for (const t of targets) {
        const loc = typeof t === 'string' ? page.locator(t).first() : t;
        const b = await loc.boundingBox();
        if (!b) throw new Error(id + ': target not visible ' + (typeof t === 'string' ? t : '(locator)'));
        if (b.x < clip.x - 2 || b.y < clip.y - 2 || b.x + b.width > clip.x + clip.width + 2 || b.y + b.height > clip.y + clip.height + 2) {
          throw new Error(id + ': target outside the picture ' + (typeof t === 'string' ? t : '(locator)') + ' ' + JSON.stringify(b) + ' clip ' + JSON.stringify(clip));
        }
        const m = { x: Math.round((b.x - clip.x) * DSF), y: Math.round((b.y - clip.y) * DSF), w: Math.round(b.width * DSF), h: Math.round(b.height * DSF) };
        if (sides[marks.length]) m.side = sides[marks.length];
        marks.push(m);
      }
      await page.screenshot({ path: `${OUT}/${id}.png`, clip });
      records[id] = { img: `shots/${id}.webp`, w: Math.round(clip.width * DSF), h: Math.round(clip.height * DSF), marks, note };
      fs.writeFileSync(RECORDS, JSON.stringify(records, null, 1));
      console.log('  shot', id, records[id].w + 'x' + records[id].h, marks.length + ' marks');
    },
    async close() { if (errs.length) console.log('PAGE ERRORS', errs); await browser.close(); },
  };
  return h;
}

/** A row (li / tr) that shows this HN. */
export const rowOf = (page, scope, hn) => page.locator(`${scope}`, { has: page.locator(`.hn:text-is("${hn}")`) }).first();
