// Module-level app timezone. 'auto' (or empty) = use system timezone.
// Components must subscribe to preferences.appTimezone and call setAppTimezone
// so that formatters in utils.ts pick up the new value.

let _appTimezone: string = 'auto';

export function setAppTimezone(tz: string | null | undefined): void {
  _appTimezone = tz && tz.length > 0 ? tz : 'auto';
}

export function getAppTimezone(): string {
  if (_appTimezone && _appTimezone !== 'auto') return _appTimezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Apply the user's timezone to an Intl.DateTimeFormat options object.
export function withAppTz(options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions {
  return { ...options, timeZone: getAppTimezone() };
}

// Convenience: format a Date in the user's timezone.
export function tzFormat(
  date: Date,
  options: Intl.DateTimeFormatOptions = {},
  locale: string = 'ko-KR'
): string {
  return new Intl.DateTimeFormat(locale, withAppTz(options)).format(date);
}

// Return a "wall-time" Date: a Date whose SYSTEM-LOCAL fields equal the input's
// fields in the app timezone. Pass this to date-fns functions (startOfDay,
// format('yyyy-MM-dd'), isSameDay, etc.) so boundaries are computed in the
// user's chosen timezone instead of the OS timezone.
//
// Never use the returned Date as a real UTC instant — it is only valid for
// date-fns operations that read the local fields.
export function tzShift(date: Date): Date {
  const p = tzDateParts(date);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
}

// "YYYY-MM-DD" in the app timezone.
export function tzDayKey(date: Date): string {
  const p = tzDateParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// Format a Date for a datetime-local input using app-timezone wall fields.
export function formatForDateTimeLocal(date: Date): string {
  const p = tzDateParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// Format a Date for a date input (YYYY-MM-DD) in app timezone.
export function formatForDateInput(date: Date): string {
  return tzDayKey(date);
}

// Convert y/m/d/h/m interpreted as wall time in a given timezone to the
// corresponding UTC instant. Handles DST by iteratively measuring tz offset.
function wallTimeInTzToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  tz: string,
): Date {
  // Treat fields as UTC as first guess.
  const guessUtc = Date.UTC(y, mo - 1, d, h, mi);
  const parts = tzDateParts(new Date(guessUtc));
  const asUtcFields = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const offsetMs = asUtcFields - guessUtc;
  return new Date(guessUtc - offsetMs);
}

// Parse a "YYYY-MM-DDTHH:mm" string as wall time in app timezone → UTC Date.
export function parseWallTimeInAppTz(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!m) return new Date(value);
  const [, y, mo, d, h, mi] = m;
  return wallTimeInTzToUtc(+y, +mo, +d, +h, +mi, getAppTimezone());
}

// For an allDay event whose `date` was stored as UTC midnight of the intended
// day (Google's `{ date: "YYYY-MM-DD" }` parsed via `new Date(str)`), return a
// wall-space Date on that same calendar day — independent of any timezone.
export function dateOnlyWall(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Parse "YYYY-MM-DD" as a wall date at the given hour in app timezone → UTC Date.
export function parseDateInAppTz(value: string, hour: number = 12, minute: number = 0): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return new Date(value);
  const [, y, mo, d] = m;
  return wallTimeInTzToUtc(+y, +mo, +d, hour, minute, getAppTimezone());
}

// Return y/m/d/h/m in the user's timezone as numbers (for same-day comparisons).
export function tzDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: getAppTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
  };
}
