import { parseDate } from './dates.js';

// Plain-code checks, identical in dry-run and live mode. An action is "ready" only if it has a named owner who
// attended, a real calendar date, and is not a repeat of an earlier action in the batch.
export function validateAction(a, attendees, seen) {
  const reasons = [];
  const date = parseDate(a.due_raw);
  if (!a.owner) reasons.push('no named owner');
  else if (attendees.length && !attendees.some((p) => p.toLowerCase() === a.owner.toLowerCase())) reasons.push(`owner "${a.owner}" is not in the attendee list`);
  if (!a.due_raw) reasons.push('no due date');
  else if (!date) reasons.push(`due date "${a.due_raw}" is not a calendar date`);
  const key = `${(a.owner ?? '').toLowerCase()}|${a.task.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()}`;
  if (seen.has(key)) reasons.push('duplicate of an earlier action in this batch');
  seen.add(key);
  return { status: reasons.length ? 'needs_review' : 'ready', reasons, due: date };
}
