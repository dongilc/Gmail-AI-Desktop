import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return '\uC5B4\uC81C';
  } else if (days < 7) {
    return `${days}\uC77C \uC804`;
  }
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// Return date only (no time)
export function formatShortDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((today.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) {
    return '\uC624\uB298';
  } else if (diff === 1) {
    return '\uC5B4\uC81C';
  } else if (diff < 7) {
    return `${diff}\uC77C \uC804`;
  }
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function formatFullDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export function formatDateRange(start: Date, end: Date, allDay: boolean): string {
  if (allDay) {
    if (start.toDateString() === end.toDateString()) {
      return formatFullDate(start);
    }
    return `${formatFullDate(start)} - ${formatFullDate(end)}`;
  }

  if (start.toDateString() === end.toDateString()) {
    return `${formatFullDate(start)} ${formatTime(start)} - ${formatTime(end)}`;
  }

  return `${formatFullDate(start)} ${formatTime(start)} - ${formatFullDate(end)} ${formatTime(end)}`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getSenderEmailAddress(value?: string): string {
  if (!value) return '';
  const match = value.match(/<([^>]+)>/);
  if (match) return match[1].trim();

  let cleaned = value.trim();
  cleaned = cleaned.replace(/\\(["'])/g, '$1');
  cleaned = cleaned.replace(/[“”"]/g, '');
  cleaned = cleaned.replace(/\\+/g, '');
  cleaned = cleaned.replace(/^'+|'+$/g, '');
  return cleaned.trim();
}

export function getSenderDisplayName(name?: string, email?: string): string {
  const nameSource = name?.trim() || '';
  const emailSource = email?.trim() || '';
  const source = nameSource || emailSource;
  if (!source) return '';

  let candidate = source;
  const angleMatch = source.match(/^([^<]*)<([^>]+)>/);
  if (angleMatch) {
    candidate = (nameSource ? angleMatch[1] : angleMatch[1] || angleMatch[2]).trim();
  }

  candidate = candidate.replace(/\\(["'])/g, '$1');
  candidate = candidate.replace(/[“”"]/g, '');
  candidate = candidate.replace(/\\+/g, '');
  candidate = candidate.replace(/\s{2,}/g, ' ').trim();

  if (!candidate) return getSenderEmailAddress(emailSource);
  if (/@/.test(candidate) && !/\s/.test(candidate)) {
    return getSenderEmailAddress(emailSource || candidate);
  }

  return candidate;
}

export function formatAddressLabel(name?: string, email?: string): string {
  const display = getSenderDisplayName(name, email);
  const address = getSenderEmailAddress(email || name);
  if (display && address && display !== address) {
    return `${display} <${address}>`;
  }
  return display || address || '';
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blockTags = new Set([
    'p',
    'div',
    'section',
    'article',
    'header',
    'footer',
    'aside',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
  ]);

  const pieces: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pieces.push(node.textContent || '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      pieces.push('\n');
      return;
    }

    if (tag === 'li') {
      pieces.push('\n- ');
    } else if (blockTags.has(tag)) {
      pieces.push('\n');
    }

    Array.from(el.childNodes).forEach(walk);

    if (blockTags.has(tag)) {
      pieces.push('\n');
    }
  };

  Array.from(doc.body.childNodes).forEach(walk);

  return pieces
    .join('')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\t ]+\n/g, '\n')
    .trim();
}

export function getDueDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dueDay.getTime() === today.getTime()) {
    return '\uC624\uB298';
  } else if (dueDay.getTime() === tomorrow.getTime()) {
    return '\uB0B4\uC77C';
  } else if (dueDay < today) {
    const diff = Math.floor((today.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24));
    return `${diff}\uC77C \uC9C0\uB0A8`;
  }
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function getQuickDueDate(option: 'today' | 'tomorrow' | 'nextWeek'): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);

  switch (option) {
    case 'today':
      return date;
    case 'tomorrow':
      date.setDate(date.getDate() + 1);
      return date;
    case 'nextWeek':
      date.setDate(date.getDate() + 7);
      return date;
  }
}
