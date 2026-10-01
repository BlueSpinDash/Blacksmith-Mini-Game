// Generates the prevalidated fallback layouts embedded in index.html.
// Run: node tools/make-fallbacks.mjs
import fs from 'node:fs';
import { loadCore, HTML_PATH } from './load-core.mjs';

const core = loadCore();
const PER_DIFFICULTY = 3;
const out = {};

for (const key of core.CONFIG.order) {
  out[key] = [];
  let seed = 1;
  while (out[key].length < PER_DIFFICULTY && seed < 5000) {
    const board = core.generateBoard(key, core.mulberry32(seed * 2654435761 % 2147483647));
    seed++;
    if (!board || !core.validateBoard(board)) continue;
    const pieces = board.pieces.join('');
    if (out[key].some((b) => b.pieces === pieces)) continue;
    // every symmetry of a stored board must validate too, since play uses them
    const stored = { pieces, route: board.route };
    const asBoard = { size: board.size, difficulty: key, pieces: board.pieces, route: board.route };
    for (let t = 0; t < 8; t++) {
      if (!core.validateBoard(core.transformBoard(asBoard, t))) throw new Error(`transform ${t} invalid for ${key}`);
    }
    out[key].push(stored);
  }
  if (out[key].length < PER_DIFFICULTY) throw new Error('not enough boards for ' + key);
}

const keys = core.CONFIG.order;

// ---- endless: Hamiltonian-path layouts, one visit per square ----
const endless = {};
for (const key of core.CONFIG.order) {
  endless[key] = [];
  let seed = 1;
  while (endless[key].length < PER_DIFFICULTY && seed < 5000) {
    const board = core.generateTourBoard(key, core.mulberry32(seed * 40503 % 2147483647));
    seed++;
    if (!board || !core.validateTour(board)) continue;
    const pieces = board.pieces.join('');
    if (endless[key].some((b) => b.pieces === pieces)) continue;
    for (let t = 0; t < 8; t++) {
      if (!core.validateTour(core.transformBoard({ ...board, pieces: board.pieces }, t))) {
        throw new Error(`endless transform ${t} invalid for ${key}`);
      }
    }
    endless[key].push({ pieces, route: board.route });
  }
  if (endless[key].length < PER_DIFFICULTY) throw new Error('not enough endless boards for ' + key);
}

function literalFor(table) {
  const lines = ['{'];
  keys.forEach((key, ki) => {
    lines.push(`  ${key}: [`);
    table[key].forEach((b, bi) => {
      const comma = bi === table[key].length - 1 ? '' : ',';
      lines.push(`    { pieces: '${b.pieces}',`);
      lines.push(`      route: [${b.route.join(',')}] }${comma}`);
    });
    lines.push(`  ]${ki === keys.length - 1 ? '' : ','}`);
  });
  lines.push('}');
  return lines.join('\n');
}

let html = fs.readFileSync(HTML_PATH, 'utf8');
const marker = 'const FALLBACK_BOARDS = ';
const start = html.indexOf(marker);
if (start < 0) throw new Error('FALLBACK_BOARDS not found');
const from = start + marker.length;
const end = html.indexOf(';\n', from);
html = html.slice(0, from) + literalFor(out) + html.slice(end);

const eMarker = 'const ENDLESS_FALLBACKS = ';
const eStart = html.indexOf(eMarker);
if (eStart < 0) throw new Error('ENDLESS_FALLBACKS not found');
const eFrom = eStart + eMarker.length;
const eEnd = html.indexOf(';\n', eFrom);
html = html.slice(0, eFrom) + literalFor(endless) + html.slice(eEnd);

fs.writeFileSync(HTML_PATH, html);
console.log('embedded forge', keys.map((k) => `${k}:${out[k].length}`).join(' '));
console.log('embedded endless', keys.map((k) => `${k}:${endless[k].length}`).join(' '));
