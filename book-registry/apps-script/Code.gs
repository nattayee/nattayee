/**
 * ทะเบียนหนังสือส่ง — Google Apps Script (ผูกกับ Google Sheet)
 *
 * ใช้ Google Sheet เป็นฐานข้อมูลโดยตรง: ชีตละ 1 ปี พ.ศ. (ตั้งชื่อชีต เช่น 2569)
 * แถวหัวตาราง: เลขทะเบียนส่ง | ที่ | ลงวันที่ | จาก | ถึง | เรื่อง | การปฏิบัติ | หมายเหตุ
 * เลขทะเบียนส่งรันต่อจากข้อมูลในชีต และยังเปิดดู/แก้ในชีตได้ตามปกติ
 *
 * เริ่มใช้กับไฟล์ใหม่: เมนู "ทะเบียนหนังสือ › คัดลอกข้อมูลจากไฟล์เดิม" ในชีต
 * (ต้องอ่านไฟล์เดิม สคริปต์จึงขอสิทธิ์เข้าถึง Google ชีตของผู้ใช้)
 */

// (ไม่บังคับ) ID ของ Google Sheet ทะเบียน — ส่วนที่อยู่ระหว่าง /d/ กับ /edit ในลิงก์ชีต
// ปกติไม่ต้องใส่: กดเมนู "ทะเบียนหนังสือ › เชื่อมเว็บแอปกับชีตนี้" ในชีตครั้งเดียว ระบบจะจำให้เอง
var SPREADSHEET_ID = '';

var HEADER = ['เลขทะเบียนส่ง', 'ที่', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'การปฏิบัติ', 'หมายเหตุ'];
var FIELDS = ['no', 'ref', 'date', 'from', 'to', 'subject', 'action', 'note'];
var TEXT_FIELDS = ['ref', 'from', 'to', 'subject', 'action', 'note'];
var HEADER_NAMES = {
  no: ['เลขทะเบียนส่ง', 'เลขทะเบียน', 'ลำดับ', 'เลขที่'],
  ref: ['ที่'],
  date: ['ลงวันที่', 'วันที่'],
  from: ['จาก'],
  to: ['ถึง'],
  subject: ['เรื่อง'],
  action: ['การปฏิบัติ'],
  note: ['หมายเหตุ'],
};
var TEXT_LIMITS = { ref: 100, from: 200, to: 200, subject: 1000, action: 200, note: 1000 };
var DATE_FORMAT = 'd/m/yyyy';

// อักขระไทยในพื้นที่ Private Use จากฟอนต์รุ่นเก่า (เช่น "ขอมูล") → อักขระมาตรฐาน
var THAI_PUA = {
  0xf700: 0x0e10, 0xf701: 0x0e34, 0xf702: 0x0e35, 0xf703: 0x0e36, 0xf704: 0x0e37,
  0xf705: 0x0e48, 0xf706: 0x0e49, 0xf707: 0x0e4a, 0xf708: 0x0e4b, 0xf709: 0x0e4c,
  0xf70a: 0x0e48, 0xf70b: 0x0e49, 0xf70c: 0x0e4a, 0xf70d: 0x0e4b, 0xf70e: 0x0e4c,
  0xf70f: 0x0e0d, 0xf710: 0x0e31, 0xf711: 0x0e4d, 0xf712: 0x0e47, 0xf713: 0x0e48,
  0xf714: 0x0e49, 0xf715: 0x0e4a, 0xf716: 0x0e4b, 0xf717: 0x0e4c, 0xf718: 0x0e38,
  0xf719: 0x0e39, 0xf71a: 0x0e3a,
};

// ============================================================ หน้าเว็บ

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ทะเบียนหนังสือส่ง')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** เมนูในชีต */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ทะเบียนหนังสือ')
    .addItem('เชื่อมเว็บแอปกับชีตนี้', 'linkThisSheet')
    .addItem('คัดลอกข้อมูลจากไฟล์เดิม…', 'copyFromOldSheet')
    .addToUi();
}

/** จำชีตนี้ไว้ให้เว็บแอปใช้ (เว็บแอปไม่รู้ว่า "ชีตที่เปิดอยู่" คือไฟล์ไหน) */
function linkThisSheet() {
  var ss = spreadsheet_();
  SpreadsheetApp.getUi().alert('เชื่อมเรียบร้อย', 'เว็บแอปจะใช้ชีต "' + ss.getName() + '" — กดรีเฟรชหน้าเว็บแอปได้เลย',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/** ถามลิงก์ไฟล์เดิม แล้วคัดลอกทะเบียนทุกปีมาไว้ในไฟล์นี้ */
function copyFromOldSheet() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('คัดลอกข้อมูลจากไฟล์เดิม',
    'วางลิงก์ Google Sheet ทะเบียนเดิม (ไฟล์ Excel ต้องเปิดด้วย Google ชีตและบันทึกเป็น Google ชีตก่อน)',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  try {
    var result = importFromSpreadsheet(res.getResponseText());
    var lines = result.years.map(function (y) {
      return y.skipped
        ? 'ปี ' + y.year + ': ข้าม (ไฟล์นี้มีข้อมูลปีนี้อยู่แล้ว)'
        : 'ปี ' + y.year + ': ' + y.count + ' รายการ  เลขถัดไป ' + y.nextNo;
    });
    ui.alert('คัดลอกเรียบร้อย', lines.join('\n'), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('คัดลอกไม่สำเร็จ', err.message, ui.ButtonSet.OK);
  }
}

/**
 * คัดลอกทะเบียนทุกชีตปีจากไฟล์ url มาเป็นชีตใหม่ในไฟล์นี้ (ข้อมูลที่จัดระเบียบแล้ว)
 * ไฟล์เดิมไม่ถูกแก้ ปีที่ไฟล์นี้มีข้อมูลอยู่แล้วจะถูกข้าม เลขถัดไป = เลขว่างตัวแรกของปีนั้น
 */
function importFromSpreadsheet(url) {
  var source;
  try {
    source = SpreadsheetApp.openByUrl(String(url || '').trim());
  } catch (err) {
    throw new Error('เปิดไฟล์เดิมไม่ได้ ตรวจลิงก์และสิทธิ์การเข้าถึงไฟล์ (' + err.message + ')');
  }
  return withLock_(function (ss, tz) {
    if (source.getId && ss.getId && source.getId() === ss.getId()) throw new Error('ลิงก์นี้คือไฟล์ปัจจุบัน กรุณาวางลิงก์ไฟล์เดิม');
    var srcTz = source.getSpreadsheetTimeZone();
    var found = [];
    source.getSheets().forEach(function (sheet) {
      var year = sheetYear_(sheet.getName());
      if (year && !found.some(function (f) { return f.year === year; })) found.push({ year: year, sheet: sheet });
    });
    if (!found.length) throw new Error('ไม่พบชีตที่ตั้งชื่อเป็นปี พ.ศ. (เช่น 2569) ในไฟล์เดิม');
    found.sort(function (a, b) { return a.year - b.year; });

    var years = found.map(function (f) {
      var existing = findYearSheet_(ss, f.year);
      if (existing && readSheet_(existing, f.year, tz).records.length) return { year: f.year, skipped: true };
      var records = readSheet_(f.sheet, f.year, srcTz).records.sort(function (a, b) { return a.no - b.no; });
      var sheet = existing || createYearSheet_(ss, f.year);
      writeRecords_(sheet, records, tz);
      var next = firstFreeNumber_(records.map(function (r) { return r.no; }));
      setCounter_(f.year, next);
      return { year: f.year, count: records.length, nextNo: next };
    });

    // ลบชีตว่างที่ติดมากับไฟล์ใหม่ (เช่น "ชีต1")
    ss.getSheets().forEach(function (sheet) {
      if (!sheetYear_(sheet.getName()) && sheet.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet);
    });
    return { years: years.reverse() };
  });
}

// ============================================================ API (เรียกจากหน้าเว็บผ่าน google.script.run)

/** ข้อมูลทั้งหมดสำหรับหน้าเว็บ */
function getState() {
  var ss = spreadsheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var records = [];
  var nextNo = {};
  ss.getSheets().forEach(function (sheet) {
    var year = sheetYear_(sheet.getName());
    if (!year || nextNo[year] !== undefined) return;
    var parsed = readSheet_(sheet, year, tz);
    parsed.records.forEach(function (r) { records.push(publicRecord_(r)); });
    nextNo[year] = nextNo_(year, parsed);
  });
  var thisYear = currentYear_(tz);
  if (nextNo[thisYear] === undefined) nextNo[thisYear] = nextNo_(thisYear, null);
  return { records: records, nextNo: nextNo, currentYear: thisYear, sheetUrl: ss.getUrl() };
}

/** ออกเลขใหม่: ได้เลขถัดไปของปี พ.ศ. ตามวันที่หนังสือ */
function createRecord(input) {
  return withLock_(function (ss, tz) {
    if (!validDate_(input.date)) throw new Error('กรุณาระบุวันที่ให้ถูกต้อง');
    var fields = cleanFields_(input);
    if (!fields.subject) throw new Error('กรุณาระบุเรื่อง');

    var year = beYearOf_(input.date);
    var sheet = findYearSheet_(ss, year) || createYearSheet_(ss, year);
    var parsed = readSheet_(sheet, year, tz);
    var no = nextNo_(year, parsed);
    // ถ้ามีแถวที่พิมพ์เลขรอไว้แล้ว ให้เขียนลงแถวนั้น ไม่งั้นต่อท้ายชีต
    var row = parsed.placeholders[no] || sheet.getLastRow() + 1;

    var rec = { year: year, no: no, date: input.date, dateText: '' };
    TEXT_FIELDS.forEach(function (f) { rec[f] = fields[f] || ''; });
    writeRow_(sheet, row, parsed.cols, rec, tz);
    setCounter_(year, no + 1);
    return publicRecord_(rec);
  });
}

/** แก้ไขรายการ key = { year, no } */
function updateRecord(key, input) {
  return withLock_(function (ss, tz) {
    var found = findRecord_(ss, tz, key);
    var rec = found.record;
    var update = cleanFields_(input);

    if (input.no !== undefined && input.no !== null && input.no !== '' && Number(input.no) !== rec.no) {
      var no = Number(input.no);
      if (!isPositiveInt_(no)) throw new Error('เลขทะเบียนส่งต้องเป็นจำนวนเต็มบวก');
      var taken = found.parsed.records.some(function (r) { return r.no === no; });
      if (taken) throw new Error('เลข ' + no + ' ของปี ' + rec.year + ' มีอยู่แล้ว');
      update.no = no;
    }
    if (input.date) {
      if (!validDate_(input.date)) throw new Error('กรุณาระบุวันที่ให้ถูกต้อง');
      update.date = input.date;
    }

    writeRow_(found.sheet, rec.row, found.parsed.cols, update, tz);
    // เรื่องที่เคยเขียนต่อบรรทัดถัดไป ถูกรวมไว้ในแถวหลักแล้ว จึงล้างบรรทัดต่อออก
    if (update.subject !== undefined || update.note !== undefined) {
      rec.extraRows.forEach(function (r) {
        writeRow_(found.sheet, r, found.parsed.cols, { subject: '', note: '' }, tz);
      });
    }

    var result = {};
    Object.keys(rec).forEach(function (k) { result[k] = rec[k]; });
    Object.keys(update).forEach(function (k) { result[k] = update[k]; });
    if (update.date) result.dateText = '';
    return publicRecord_(result);
  });
}

/** ลบรายการ: ล้างข้อมูลในแถว แต่เก็บเลขไว้ในคอลัมน์แรก (เหมือนแถวที่เตรียมเลขไว้) */
function deleteRecord(key) {
  return withLock_(function (ss, tz) {
    var found = findRecord_(ss, tz, key);
    var rec = found.record;
    var next = nextNo_(rec.year, found.parsed);

    var blank = {};
    TEXT_FIELDS.forEach(function (f) { blank[f] = ''; });
    blank.date = '';
    writeRow_(found.sheet, rec.row, found.parsed.cols, blank, tz);
    rec.extraRows.forEach(function (r) {
      writeRow_(found.sheet, r, found.parsed.cols, { subject: '', note: '' }, tz);
    });

    // ลบเลขล่าสุดที่เพิ่งออก → คืนเลขนั้นให้ใช้ใหม่ได้ ส่วนเลขกลางทางไม่ถอยกลับ
    setCounter_(rec.year, next === rec.no + 1 ? rec.no : next);
    return publicRecord_(rec);
  });
}

/** ตั้งเลขถัดไปของปีเอง (ระบบจะข้ามเลขที่มีอยู่แล้วให้) */
function setNextNo(year, next) {
  year = Number(year);
  next = Number(next);
  if (!isPositiveInt_(year) || year < 2400 || year > 3000) throw new Error('ปี พ.ศ. ไม่ถูกต้อง');
  if (!isPositiveInt_(next)) throw new Error('เลขถัดไปต้องเป็นจำนวนเต็มบวก');
  return withLock_(function (ss, tz) {
    setCounter_(year, next);
    var sheet = findYearSheet_(ss, year);
    return nextNo_(year, sheet ? readSheet_(sheet, year, tz) : null);
  });
}

// ============================================================ อ่านชีต

function readSheet_(sheet, year, tz) {
  var values = sheet.getDataRange().getValues();
  var header = findHeader_(values);
  var cols = header.cols;
  var records = [];
  var placeholders = {};
  var seen = {};
  var prev = null;

  for (var r = header.row + 1; r < values.length; r++) {
    var row = values[r];
    var get = function (f) { return cols[f] < row.length ? row[cols[f]] : ''; };
    var rec = {
      year: year,
      no: parseNumber_(get('no')),
      date: null,
      dateText: '',
      row: r + 1,
      extraRows: [],
    };
    TEXT_FIELDS.forEach(function (f) { rec[f] = cleanText_(get(f)); });

    var rawDate = get('date');
    if (rawDate !== '' && rawDate !== null) {
      rec.date = parseDate_(rawDate, year, tz);
      if (!rec.date) rec.dateText = cleanText_(rawDate);
    }

    var hasContent = rec.date || rec.dateText || TEXT_FIELDS.some(function (f) { return rec[f]; });
    if (!hasContent) {
      // แถวที่มีแต่เลขลำดับ = เลขที่เตรียมไว้ล่วงหน้า ยังไม่ถูกใช้
      if (rec.no !== null && !placeholders[rec.no]) placeholders[rec.no] = r + 1;
      continue;
    }
    if (rec.no === null) {
      // แถวที่ไม่มีเลขและมีแต่เรื่อง/หมายเหตุ = บรรทัดต่อของรายการก่อนหน้า
      var continuation = !rec.ref && !rec.date && !rec.dateText && !rec.from && !rec.to && !rec.action;
      if (continuation && prev) {
        prev.subject = [prev.subject, rec.subject].filter(Boolean).join(' ');
        prev.note = [prev.note, rec.note].filter(Boolean).join(' ');
        prev.extraRows.push(r + 1);
      }
      continue;
    }
    if (seen[rec.no]) continue;
    seen[rec.no] = true;
    records.push(rec);
    prev = rec;
  }
  return { records: records, placeholders: placeholders, cols: cols };
}

function findHeader_(values) {
  var defaults = {};
  FIELDS.forEach(function (f, i) { defaults[f] = i; });
  for (var r = 0; r < Math.min(values.length, 10); r++) {
    var cells = values[r].map(cleanText_);
    if (cells.indexOf('เรื่อง') < 0) continue;
    var cols = {};
    FIELDS.forEach(function (f) {
      var idx = -1;
      for (var c = 0; c < cells.length && idx < 0; c++) {
        if (HEADER_NAMES[f].indexOf(cells[c]) >= 0) idx = c;
      }
      cols[f] = idx >= 0 ? idx : defaults[f];
    });
    return { row: r, cols: cols };
  }
  return { row: -1, cols: defaults };
}

function findRecord_(ss, tz, key) {
  var year = Number(key && key.year);
  var no = Number(key && key.no);
  var sheet = findYearSheet_(ss, year);
  var parsed = sheet && readSheet_(sheet, year, tz);
  var record = parsed && parsed.records.filter(function (r) { return r.no === no; })[0];
  if (!record) throw new Error('ไม่พบเลข ' + no + ' ของปี ' + year + ' (อาจถูกลบหรือแก้ไขในชีตไปแล้ว)');
  return { sheet: sheet, parsed: parsed, record: record };
}

// ============================================================ เขียนชีต

/** เขียนเฉพาะช่องที่มีใน values ลงแถว row (ข้อความถูกเก็บเป็นข้อความเสมอ ไม่ถูกแปลงเป็นสูตร/วันที่) */
function writeRow_(sheet, row, cols, values, tz) {
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows() + 50);
  var idx = FIELDS.map(function (f) { return cols[f]; });
  var min = Math.min.apply(null, idx);
  var max = Math.max.apply(null, idx);
  var range = sheet.getRange(row, min + 1, 1, max - min + 1);
  var cells = range.getValues()[0];
  var formats = range.getNumberFormats()[0];

  FIELDS.forEach(function (f) {
    if (values[f] === undefined) return;
    var i = cols[f] - min;
    if (f === 'date') {
      cells[i] = values.date ? Utilities.parseDate(values.date, tz, 'yyyy-MM-dd') : '';
      formats[i] = DATE_FORMAT;
    } else if (f === 'no') {
      cells[i] = values.no;
    } else {
      cells[i] = values[f];
      formats[i] = '@';
    }
  });
  range.setNumberFormats([formats]);
  range.setValues([cells]);
}

/** เขียนรายการทั้งหมดต่อจากหัวตาราง (ใช้ตอนคัดลอกจากไฟล์เดิม) */
function writeRecords_(sheet, records, tz) {
  if (!records.length) return;
  var cols = findHeader_(sheet.getDataRange().getValues()).cols;
  var start = sheet.getLastRow() + 1;
  var need = start + records.length - 1;
  if (need > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows() + 50);
  var width = Math.max.apply(null, FIELDS.map(function (f) { return cols[f]; })) + 1;
  var values = [];
  var formats = [];
  records.forEach(function (r) {
    var line = [];
    var fmt = [];
    for (var i = 0; i < width; i++) { line.push(''); fmt.push('@'); }
    FIELDS.forEach(function (f) {
      var i = cols[f];
      if (f === 'no') { line[i] = r.no; fmt[i] = '0'; }
      else if (f === 'date') {
        line[i] = r.date ? Utilities.parseDate(r.date, tz, 'yyyy-MM-dd') : r.dateText;
        fmt[i] = r.date ? DATE_FORMAT : '@';
      } else line[i] = r[f] || '';
    });
    values.push(line);
    formats.push(fmt);
  });
  var range = sheet.getRange(start, 1, records.length, width);
  range.setNumberFormats(formats);
  range.setValues(values);
}

function findYearSheet_(ss, year) {
  return ss.getSheets().filter(function (s) { return sheetYear_(s.getName()) === year; })[0] || null;
}

function createYearSheet_(ss, year) {
  var sheet = ss.insertSheet(String(year), 0);
  sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(6, 420);
  return sheet;
}

// ============================================================ ตัวนับเลข

/** เลขถัดไป: ต่อจากตัวนับที่บันทึกไว้ (ถ้ายังไม่มี = เลขว่างตัวแรกนับจากเลขแรกของปี) และข้ามเลขที่ใช้แล้ว */
function nextNo_(year, parsed) {
  var used = parsed ? parsed.records.map(function (r) { return r.no; }) : [];
  var taken = {};
  used.forEach(function (n) { taken[n] = true; });
  var stored = Number(PropertiesService.getScriptProperties().getProperty('next_' + year));
  var n = stored >= 1 ? stored : firstFreeNumber_(used);
  while (taken[n]) n++;
  return n;
}

function setCounter_(year, next) {
  PropertiesService.getScriptProperties().setProperty('next_' + year, String(next));
}

function firstFreeNumber_(numbers) {
  if (!numbers.length) return 1;
  var taken = {};
  numbers.forEach(function (n) { taken[n] = true; });
  var n = Math.min.apply(null, numbers);
  while (taken[n]) n++;
  return n;
}

/**
 * ชีตทะเบียน: ถ้ารันจากในชีต (เมนู) ใช้ชีตนั้นและจำ ID ไว้
 * ถ้ารันเป็นเว็บแอป ใช้ SPREADSHEET_ID หรือ ID ที่จำไว้
 */
function spreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    if (!SPREADSHEET_ID && props.getProperty('SPREADSHEET_ID') !== active.getId()) props.setProperty('SPREADSHEET_ID', active.getId());
    if (!SPREADSHEET_ID || SPREADSHEET_ID === active.getId()) return active;
  }
  var id = SPREADSHEET_ID || props.getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('เว็บแอปยังไม่ได้เชื่อมกับ Google Sheet — เปิดชีตทะเบียน รีเฟรชหน้า แล้วกดเมนู ' +
      '"ทะเบียนหนังสือ › เชื่อมเว็บแอปกับชีตนี้" (หรือใส่ SPREADSHEET_ID ที่บรรทัดบนสุดของ Code.gs)');
  }
  try {
    return SpreadsheetApp.openById(id);
  } catch (err) {
    throw new Error('เปิด Google Sheet ทะเบียนไม่ได้ (ID ' + id + ') ตรวจว่ามีสิทธิ์แก้ไขชีตนี้: ' + err.message);
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('มีผู้ใช้อื่นกำลังบันทึกอยู่ กรุณาลองใหม่อีกครั้ง');
  try {
    var ss = spreadsheet_();
    var result = fn(ss, ss.getSpreadsheetTimeZone());
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================ แปลงข้อมูล

function publicRecord_(r) {
  return {
    id: r.year + '-' + r.no,
    year: r.year,
    no: r.no,
    ref: r.ref || '',
    date: r.date || null,
    dateText: r.dateText || '',
    from: r.from || '',
    to: r.to || '',
    subject: r.subject || '',
    action: r.action || '',
    note: r.note || '',
  };
}

function cleanFields_(input) {
  var out = {};
  TEXT_FIELDS.forEach(function (f) {
    if (input[f] === undefined) return;
    var v = String(input[f] === null ? '' : input[f]).replace(/\s+/g, ' ').trim();
    if (v.length > TEXT_LIMITS[f]) throw new Error('ข้อความช่อง "' + HEADER[FIELDS.indexOf(f)] + '" ยาวเกิน ' + TEXT_LIMITS[f] + ' ตัวอักษร');
    out[f] = v;
  });
  return out;
}

function cleanText_(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (isDate_(value)) return '';
  return String(value)
    .replace(/[-]/g, function (ch) { return String.fromCharCode(THAI_PUA[ch.charCodeAt(0)]); })
    .replace(/\s+/g, ' ')
    .trim();
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function isPositiveInt_(n) {
  return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 1 && n <= 99999;
}

function parseNumber_(value) {
  if (typeof value === 'number' && isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) return Number(value);
  return null;
}

function sheetYear_(name) {
  var m = /^\s*(?:พ\.?\s*ศ\.?\s*)?(25\d\d)\s*$/.exec(name || '');
  return m ? Number(m[1]) : null;
}

function currentYear_(tz) {
  return Number(Utilities.formatDate(new Date(), tz, 'yyyy')) + 543;
}

function beYearOf_(iso) {
  return Number(iso.slice(0, 4)) + 543;
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function isoDate_(ceYear, month, day) {
  if (!(month >= 1 && month <= 12 && day >= 1)) return null;
  var last = new Date(Date.UTC(ceYear, month, 0)).getUTCDate();
  if (day > last) return null;
  return ceYear + '-' + pad2_(month) + '-' + pad2_(day);
}

function validDate_(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return !!m && isoDate_(+m[1], +m[2], +m[3]) === value;
}

/** ปี 4 หลัก: มากกว่า 2400 ถือเป็น พ.ศ. → คืนค่าเป็น ค.ศ. */
function toCE_(year) {
  return year > 2400 ? year - 543 : year;
}

/**
 * อ่านวันที่จากเซลล์ → 'YYYY-MM-DD' (ค.ศ.) หรือ null
 * - เซลล์วันที่: ใช้วัน/เดือนตามที่เก็บไว้ ปีที่พิมพ์เป็น พ.ศ. (เช่น 2569) แปลงเป็น ค.ศ.
 * - ข้อความ เช่น "19/3/2025", "13/8-69", "5/25/2569" อ่านเป็น วัน/เดือน/ปี
 *   ยกเว้นตัวที่สองเกิน 12 จะถือเป็น เดือน/วัน/ปี
 */
function parseDate_(value, yearBE, tz) {
  if (isDate_(value)) {
    var p = Utilities.formatDate(value, tz, 'yyyy-MM-dd').split('-').map(Number);
    return isoDate_(toCE_(p[0]), p[1], p[2]);
  }
  if (typeof value !== 'string') return null;
  var s = value.trim();
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate_(toCE_(+m[1]), +m[2], +m[3]);

  m = /^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  var day = +m[1];
  var month = +m[2];
  if (month > 12 && day <= 12) { var t = day; day = month; month = t; }

  var year;
  if (m[3].length === 4) {
    year = toCE_(+m[3]);
  } else {
    // ปี 2 หลัก: เลือกระหว่าง พ.ศ. 25xx กับ ค.ศ. 20xx ให้ใกล้ปีของชีตที่สุด
    var yy = +m[3];
    var asBE = 2500 + yy - 543;
    var asCE = 2000 + yy;
    var target = yearBE - 543;
    year = Math.abs(asBE - target) <= Math.abs(asCE - target) ? asBE : asCE;
  }
  return isoDate_(year, month, day);
}
