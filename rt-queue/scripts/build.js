#!/usr/bin/env node
'use strict';

// Keeps generated parts in sync:
//  - holidays.json → DEFAULT_HOLIDAYS in public/index.html and HOLIDAYS_SEED in apps-script/Code.gs
//  - physicians.json / sites.json → PHYSICIANS / SITES in public/index.html and apps-script/Code.gs
//  - public/index.html → apps-script/Index.html (storage swapped for scripts/gas-storage.js)
// Usage: node scripts/build.js          (write files)
//        node scripts/build.js --check  (exit 1 if anything is out of date)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public', 'index.html');
const GS = path.join(ROOT, 'apps-script', 'Code.gs');
const GAS_HTML = path.join(ROOT, 'apps-script', 'Index.html');
const HOLIDAYS = path.join(ROOT, 'holidays.json');
const LISTS = [['PHYSICIANS', 'physicians.json'], ['SITES', 'sites.json']];

// Storage layer for the Apps Script page (google.script.run + LPCH RO Workspace sign-in).
const GAS_STORAGE = fs.readFileSync(path.join(__dirname, 'gas-storage.js'), 'utf8');

function replaceBetween(src, start, end, body, file) {
  const i = src.indexOf(start);
  const j = src.indexOf(end);
  if (i === -1 || j === -1 || j < i) throw new Error(`markers ${start} / ${end} not found in ${file}`);
  return src.slice(0, i + start.length) + body + src.slice(j);
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const holidays = JSON.parse(fs.readFileSync(HOLIDAYS, 'utf8'));

let html = replaceBetween(fs.readFileSync(HTML, 'utf8'), '/* HOLIDAYS:START */', '/* HOLIDAYS:END */',
  `\n  const DEFAULT_HOLIDAYS = [\n${holidays.map(h => `    [${q(h.date)}, ${q(h.name)}],`).join('\n')}\n  ];\n  `, HTML);
for (const [name, file] of LISTS) {
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  html = replaceBetween(html, `/* ${name}:START */`, `/* ${name}:END */`,
    `\n  const ${name} = [\n${items.map(n => `    ${q(n)},`).join('\n')}\n  ];\n  `, HTML);
}
let gsCode = replaceBetween(fs.readFileSync(GS, 'utf8'), '// HOLIDAYS:START', '// HOLIDAYS:END',
  `\nconst HOLIDAYS_SEED = [\n${holidays.map(h => `  [${q(h.date)}, ${q(h.name)}],`).join('\n')}\n];\n`, GS);
for (const [name, file] of LISTS) {
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  gsCode = replaceBetween(gsCode, `// ${name}:START`, `// ${name}:END`,
    `\nconst ${name} = [\n${items.map(n => `  ${q(n)},`).join('\n')}\n];\n`, GS);
}
const gasHtml = replaceBetween(html, '/* STORAGE:START */', '/* STORAGE:END */', GAS_STORAGE, HTML)
  .replace('/* STORAGE:START */', '/* generated from public/index.html by scripts/build.js — edit that file instead */');

const outputs = [[HTML, html], [GS, gsCode], [GAS_HTML, gasHtml]];
if (process.argv.includes('--check')) {
  const stale = outputs.filter(([file, body]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== body);
  if (stale.length) {
    console.error('Out of date (run `npm run build`): ' + stale.map(([f]) => path.relative(ROOT, f)).join(', '));
    process.exit(1);
  }
  console.log('Generated files are up to date.');
} else {
  for (const [file, body] of outputs) fs.writeFileSync(file, body);
  console.log('Built ' + outputs.map(([f]) => path.relative(ROOT, f)).join(', '));
}
