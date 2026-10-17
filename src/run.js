import { dryRunExtract, claudeExtract, dropUnseen } from './extract.js';
import { validateAction } from './validate.js';

export const COLUMNS = ['meeting', 'owner', 'task', 'due', 'status', 'reasons'];

export async function processAll(files, { dryRun = true, client } = {}) {
  const seen = new Set();
  const rows = [];
  for (const { name, text } of files) {
    let x;
    try { x = dryRun ? dryRunExtract(text) : dropUnseen(await claudeExtract(text, { client }), text); }
    catch (e) { rows.push({ meeting: name, owner: '', task: '', due: '', status: 'needs_review', reasons: [`extraction failed: ${e.message}`] }); continue; }
    for (const a of x.actions) {
      const v = validateAction(a, x.attendees, seen);
      rows.push({ meeting: name, owner: a.owner ?? '', task: a.task, due: v.due ?? a.due_raw ?? '', status: v.status, reasons: v.reasons });
    }
  }
  return rows;
}

export function summarize(rows) {
  const ready = rows.filter((r) => r.status === 'ready').length;
  return { total: rows.length, ready, needs_review: rows.length - ready };
}

export function renderMarkdown(rows, s, { source, mode }) {
  return [`# Meeting action items (${mode} mode, ${source})`, '',
    `${s.total} action items: ${s.ready} ready, ${s.needs_review} need a human look.`, '',
    'An item is ready only if it has a named owner who attended and a real calendar date. Nothing is assigned, emailed or posted anywhere.', '',
    '| meeting | owner | task | due | status |', '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.meeting} | ${r.owner} | ${r.task} | ${r.due} | ${r.status} |`), '',
    '## Why something needs review', '',
    ...rows.filter((r) => r.reasons.length).map((r) => `- **${r.meeting}**, "${r.task}": ${r.reasons.join('; ')}`)].join('\n') + '\n';
}
