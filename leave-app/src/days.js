// Date helpers. All dates are plain 'YYYY-MM-DD' strings handled in UTC
// so that the result never depends on the server's time zone.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function* eachDate(start, end) {
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function isWeekend(s) {
  const day = new Date(s + 'T00:00:00Z').getUTCDay();
  return day === 0 || day === 6;
}

// Number of working days (Mon-Fri, excluding holidays) between start and end
// inclusive. A half-day request counts as 0.5 and must be a single day.
function countLeaveDays(start, end, halfDay, holidays = new Set()) {
  let days = 0;
  for (const d of eachDate(start, end)) {
    if (!isWeekend(d) && !holidays.has(d)) days += 1;
  }
  if (halfDay && days > 0) return 0.5;
  return days;
}

module.exports = { isValidDate, eachDate, isWeekend, countLeaveDays };
