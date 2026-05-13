const DAY_MS = 24 * 60 * 60 * 1000;

export function todayISO(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function daysBetween(startISO, endISO = todayISO()) {
  const start = parseLocalDate(startISO);
  const end = parseLocalDate(endISO);
  if (!start || !end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS);
}

export function daysSince(dateISO, now = new Date()) {
  return daysBetween(dateISO, todayISO(now));
}

export function addDays(dateISO, amount) {
  const date = parseLocalDate(dateISO);
  if (!date) return "";
  date.setDate(date.getDate() + amount);
  return todayISO(date);
}

export function isWeekend(date = new Date()) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isWithinPastDays(dateISO, days, now = new Date()) {
  const elapsed = daysSince(dateISO, now);
  return elapsed >= 0 && elapsed <= days;
}
