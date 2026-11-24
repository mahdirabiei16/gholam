const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function formatPersianTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return toPersianDigits(`${hours}:${minutes}`);
}

export function getOrCreateSessionId(): string {
  const key = 'hamsohbat_session_id';
  const existing = window.localStorage.getItem(key);
  if (existing && /^[a-zA-Z0-9_-]+$/.test(existing)) {
    return existing;
  }
  const created = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
  window.localStorage.setItem(key, created);
  return created;
}
