#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { processAll, summarize, renderMarkdown, COLUMNS } from '../src/run.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  'dry-run': { type: 'boolean' }, out: { type: 'string', default: 'out' }, help: { type: 'boolean' } } });
if (values.help || !positionals[0]) {
  console.log('Usage: meeting-actions <folder-of-.txt-notes> [--dry-run] [--out dir]\n\nEach meeting is a .txt file of notes or a transcript.\nWithout --dry-run, set ANTHROPIC_API_KEY. Nothing is assigned, emailed or posted anywhere.');
  process.exit(values.help ? 0 : 1);
}
const csvCell = (v) => { const s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
try {
  const dry = values['dry-run'];
  if (!dry && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (use --dry-run to try it without a key)');
  if (!statSync(positionals[0]).isDirectory()) throw new Error('give a folder of .txt files');
  const files = readdirSync(positionals[0]).filter((f) => f.endsWith('.txt')).sort().map((f) => ({ name: f, text: readFileSync(join(positionals[0], f), 'utf8') }));
  if (!files.length) throw new Error('no .txt files in that folder');
  const rows = await processAll(files, { dryRun: !!dry });
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, 'actions.csv'), [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
  const md = renderMarkdown(rows, summarize(rows), { source: positionals[0], mode: dry ? 'dry-run' : 'live' });
  writeFileSync(join(values.out, 'actions.md'), md);
  console.log(md);
} catch (e) { console.error('Error: ' + e.message); process.exit(1); }
