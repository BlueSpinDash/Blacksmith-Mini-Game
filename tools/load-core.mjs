// Extracts the CORE block out of index.html so it can be tested in Node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = path.join(here, '..', 'index.html');

export function coreSource(html) {
  const src = html ?? fs.readFileSync(HTML_PATH, 'utf8');
  const start = src.indexOf('/* ==== CORE START ==== */');
  const end = src.indexOf('/* ==== CORE END ==== */');
  if (start < 0 || end < 0) throw new Error('core markers not found');
  return src.slice(start, end);
}

export function loadCore(opts = {}) {
  let code = coreSource();
  if (code.includes('__ENDLESS_FALLBACK__')) { code = code.replace('__ENDLESS_FALLBACK__', opts.endlessFallback ?? '{}'); }
  if (code.includes('__FALLBACK__')) {
    code = code.replace('__FALLBACK__', opts.fallback ?? '{}');
  }
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\nreturn CHECKSMITH_CORE;`)();
}
