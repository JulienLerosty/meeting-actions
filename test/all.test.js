import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDate } from '../src/dates.js';
import { dryRunExtract, claudeExtract, dropUnseen } from '../src/extract.js';
import { processAll, summarize } from '../src/run.js';

const DIR = new URL('../fixtures/meetings/', import.meta.url).pathname;
const files = readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort().map((name) => ({ name, text: readFileSync(join(DIR, name), 'utf8') }));
const CLI = new URL('../bin/cli.js', import.meta.url).pathname;
const fake = (obj) => ({ messages: { create: async () => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }) } });

test('dates: ISO and named months parse; numeric, vague and impossible dates do not', () => {
  assert.equal(parseDate('2026-05-08'), '2026-05-08');
  assert.equal(parseDate('May 12, 2026'), '2026-05-12');
  assert.equal(parseDate('05/06/2026'), null);
  assert.equal(parseDate('Friday'), null);
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate(null), null);
});

test('dry-run reads attendees, owners, tasks and due dates', () => {
  const x = dryRunExtract(files[0].text);
  assert.deepEqual(x.attendees, ['Maya', 'Tom', 'Priya']);
  assert.equal(x.actions.length, 3);
  assert.deepEqual(x.actions[0], { owner: 'Maya', task: 'send the revised quote', due_raw: '2026-05-08', quote: 'Maya to send the revised quote by 2026-05-08' });
});

test('batch: each fixture action lands as planted', async () => {
  const rows = await processAll(files);
  const by = (m, s) => rows.find((r) => r.meeting.startsWith(m) && r.task.includes(s));
  assert.equal(by('01', 'quote').status, 'ready');
  assert.equal(by('01', 'photos').due, '2026-05-12');
  assert.equal(by('01', 'homepage').status, 'ready');
  assert.match(by('02', 'staging').reasons.join(), /no named owner/);
  assert.match(by('02', 'shipping').reasons.join(), /not a calendar date/);
  assert.match(by('02', 'venue').reasons.join(), /not in the attendee list/);
  assert.match(by('02', 'footer').reasons.join(), /no due date/);
  assert.match(by('02', 'quote').reasons.join(), /duplicate/);
  assert.deepEqual(summarize(rows), { total: 9, ready: 4, needs_review: 5 });
});

test('text inside the notes cannot change an owner or date', async () => {
  const rows = await processAll(files);
  const r = rows.find((x) => x.meeting.startsWith('03'));
  assert.equal(rows.filter((x) => x.meeting.startsWith('03')).length, 1);
  assert.equal(r.owner, 'Lena');
  assert.equal(r.due, '2026-06-02');
});

test('live path: valid JSON is accepted, an invented action is dropped', async () => {
  const text = files[0].text;
  const good = { title: 'x', attendees: ['Maya'], actions: [
    { owner: 'Maya', task: 'send the revised quote', due_raw: '2026-05-08', quote: 'Maya to send the revised quote by 2026-05-08' },
    { owner: 'Tom', task: 'buy a new server', due_raw: '2026-06-01', quote: 'Tom to buy a new server by 2026-06-01' }] };
  const x = dropUnseen(await claudeExtract(text, { client: fake(good) }), text);
  assert.equal(x.actions.length, 1);
  assert.equal(x.actions[0].owner, 'Maya');
});

test('live path: owner or date not inside the quote is nulled; bad JSON and bad types are safe', async () => {
  const text = files[1].text;
  const x = dropUnseen(await claudeExtract(text, { client: fake({ actions: [{ owner: 'Tom', task: 'fix footer', due_raw: '2026-01-01', quote: 'Priya to fix the footer links' }] }) }), text);
  assert.equal(x.actions[0].owner, null);
  assert.equal(x.actions[0].due_raw, null);
  await assert.rejects(claudeExtract(text, { client: fake('not json') }), /valid JSON/);
  const y = await claudeExtract(text, { client: fake({ attendees: 'Maya', actions: 7 }) });
  assert.deepEqual(y, { title: null, attendees: [], actions: [] });
});

test('live path: an extraction failure becomes a needs_review row, not a crash', async () => {
  const rows = await processAll([files[0]], { dryRun: false, client: fake('nope') });
  assert.equal(rows[0].status, 'needs_review');
  assert.match(rows[0].reasons[0], /extraction failed/);
});

test('CLI: dry-run writes the CSV and report; missing key and empty folder fail clearly', () => {
  const out = mkdtempSync(join(tmpdir(), 'ma-'));
  const ok = spawnSync('node', [CLI, DIR, '--dry-run', '--out', out], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /9 action items: 4 ready, 5 need a human look/);
  assert.ok(existsSync(join(out, 'actions.csv')) && existsSync(join(out, 'actions.md')));
  const noKey = spawnSync('node', [CLI, DIR], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(noKey.status, 1);
  assert.match(noKey.stderr, /ANTHROPIC_API_KEY/);
  const empty = spawnSync('node', [CLI, mkdtempSync(join(tmpdir(), 'ma-')), '--dry-run'], { encoding: 'utf8' });
  assert.match(empty.stderr, /no \.txt files/);
});
