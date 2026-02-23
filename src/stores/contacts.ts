import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Contact } from '../types';

interface ContactsState {
  contacts: Record<string, Contact>; // lowercase email → Contact
  addContacts: (entries: { name?: string; email: string }[]) => void;
  getSuggestions: (query: string, limit?: number) => Contact[];
}

const cleanContactName = (raw: string | undefined): string => {
  if (!raw) return '';
  let name = raw.trim();
  // "Name" <email> 형식에서 이메일 부분 제거
  name = name.replace(/<[^>]+>\s*$/, '').trim();
  // 양쪽 따옴표 제거
  if (name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1);
  }
  // 이스케이프된 따옴표 제거
  name = name.replace(/\\"/g, '').replace(/"/g, '');
  return name.trim();
};

const cleanEmail = (raw: string): string => {
  let email = raw.trim();
  // "Name" <email> 또는 Name <email> 형식에서 <email> 추출
  const match = email.match(/<([^>]+)>/);
  if (match) {
    email = match[1].trim();
  }
  return email;
};

export const useContactsStore = create<ContactsState>()(
  persist(
    (set, get) => ({
      contacts: {},

      addContacts: (entries) => {
        set((state) => {
          const next = { ...state.contacts };
          const now = Date.now();
          for (const entry of entries) {
            const email = cleanEmail(entry.email).toLowerCase();
            if (!email || !email.includes('@')) continue;
            const cleanName = cleanContactName(entry.name);
            const existing = next[email];
            if (existing) {
              next[email] = {
                ...existing,
                name: cleanName || existing.name,
                frequency: existing.frequency + 1,
                lastSeen: now,
              };
            } else {
              next[email] = {
                name: cleanName,
                email: cleanEmail(entry.email),
                frequency: 1,
                lastSeen: now,
              };
            }
          }
          return { contacts: next };
        });
      },

      getSuggestions: (query, limit = 10) => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const all = Object.values(get().contacts);
        const matched = all.filter(
          (c) =>
            c.email.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
        );
        // Sort by frequency desc, then lastSeen desc
        matched.sort((a, b) => {
          if (b.frequency !== a.frequency) return b.frequency - a.frequency;
          return b.lastSeen - a.lastSeen;
        });
        return matched.slice(0, limit);
      },
    }),
    {
      name: 'gmail-desktop-contacts',
      version: 4,
      migrate: (persisted: any) => {
        if (!persisted || !persisted.contacts) return persisted;
        const cleaned: Record<string, Contact> = {};
        for (const [, val] of Object.entries(persisted.contacts as Record<string, Contact>)) {
          const email = cleanEmail(val.email).toLowerCase();
          if (!email || !email.includes('@')) continue;
          const name = cleanContactName(val.name);
          const existing = cleaned[email];
          if (existing) {
            // 중복 병합: 높은 frequency, 최신 lastSeen, 더 나은 이름
            cleaned[email] = {
              ...existing,
              name: name || existing.name,
              frequency: existing.frequency + val.frequency,
              lastSeen: Math.max(existing.lastSeen, val.lastSeen),
            };
          } else {
            cleaned[email] = { ...val, email: cleanEmail(val.email), name };
          }
        }
        return { ...persisted, contacts: cleaned };
      },
    }
  )
);
