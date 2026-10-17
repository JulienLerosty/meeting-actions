const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Returns an ISO date (YYYY-MM-DD) or null. Numeric day/month dates such as 03/04/2026 are
// ambiguous (US or European), and words like "soon" or "next week" have no date: both return null.
export function parseDate(s) {
  s = String(s ?? '').trim();
  let y, mo, d;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) [, y, mo, d] = m;
  else if ((m = /^([A-Za-z]+) (\d{1,2}),? (\d{4})$/.exec(s))) { mo = MONTHS.indexOf(m[1].toLowerCase()) + 1; d = m[2]; y = m[3]; }
  else if ((m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(s))) { mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; d = m[1]; y = m[3]; }
  else return null;
  [y, mo, d] = [Number(y), Number(mo), Number(d)];
  if (!mo) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
