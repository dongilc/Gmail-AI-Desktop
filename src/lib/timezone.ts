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
