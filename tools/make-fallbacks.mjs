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

const lines = ['{'];
const keys = core.CONFIG.order;
keys.forEach((key, ki) => {
  lines.push(`  ${key}: [`);
  out[key].forEach((b, bi) => {
    const comma = bi === out[key].length - 1 ? '' : ',';
    lines.push(`    { pieces: '${b.pieces}',`);
    lines.push(`      route: [${b.route.join(',')}] }${comma}`);
  });
  lines.push(`  ]${ki === keys.length - 1 ? '' : ','}`);
});
lines.push('}');
const literal = lines.join('\n');

let html = fs.readFileSync(HTML_PATH, 'utf8');
const marker = 'const FALLBACK_BOARDS = ';
const start = html.indexOf(marker);
if (start < 0) throw new Error('FALLBACK_BOARDS not found');
const from = start + marker.length;
const end = html.indexOf(';\n', from);
html = html.slice(0, from) + literal + html.slice(end);
fs.writeFileSync(HTML_PATH, html);
console.log('embedded', keys.map((k) => `${k}:${out[k].length}`).join(' '));
