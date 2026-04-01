import { create } from 'zustand';
import type { EmailDraft } from '../types';

const SEND_DELAY_MS = 60_000; // 1분

type SendCallback = (
  accountId: string,
  draft: EmailDraft,
  draftId: string | null,
  isDraftEmail: boolean,
  emailId: string | null,
) => Promise<void>;

interface QueuedEmail {
  id: string;
  accountId: string;
  draft: EmailDraft;
  draftId: string | null;
  isDraftEmail: boolean;
  emailId: string | null;
  queuedAt: number;
  timerId: ReturnType<typeof setTimeout>;
  onSend: SendCallback;
  sending: boolean;
}

interface SendQueueState {
  queue: QueuedEmail[];
  enqueue: (
    accountId: string,
    draft: EmailDraft,
    draftId: string | null,
    isDraftEmail: boolean,
    emailId: string | null,
    onSend: SendCallback,
  ) => string;
  cancel: (id: string) => void;
  sendNow: (id: string) => void;
  remove: (id: string) => void;
}

let nextId = 0;

const doSend = async (entry: QueuedEmail, set: (fn: (s: SendQueueState) => Partial<SendQueueState>) => void) => {
  // mark as sending
  set((s) => ({
    queue: s.queue.map((q) => (q.id === entry.id ? { ...q, sending: true } : q)),
  }));
  try {
    await entry.onSend(entry.accountId, entry.draft, entry.draftId, entry.isDraftEmail, entry.emailId);
  } catch (error) {
    console.error('Failed to send queued email:', error);
  }
  set((s) => ({ queue: s.queue.filter((q) => q.id !== entry.id) }));
};

export const useSendQueueStore = create<SendQueueState>((set, get) => ({
  queue: [],

  enqueue: (accountId, draft, draftId, isDraftEmail, emailId, onSend) => {
    const id = `sq-${++nextId}`;
    const entry: QueuedEmail = {
      id,
      accountId,
      draft,
      draftId,
      isDraftEmail,
      emailId,
      queuedAt: Date.now(),
      timerId: 0 as any,
      onSend,
      sending: false,
    };

    entry.timerId = setTimeout(() => doSend(entry, set), SEND_DELAY_MS);

    set((s) => ({ queue: [...s.queue, entry] }));
    return id;
  },

  cancel: (id) => {
    const entry = get().queue.find((q) => q.id === id);
    if (entry) {
      clearTimeout(entry.timerId);
      // 임시보관함에 저장
      window.electronAPI?.createDraft?.(entry.accountId, entry.draft).catch((err: any) => {
        console.error('Failed to save draft on cancel:', err);
      });
      set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }));
    }
  },

  sendNow: (id) => {
    const entry = get().queue.find((q) => q.id === id);
    if (entry && !entry.sending) {
      clearTimeout(entry.timerId);
      doSend(entry, set);
    }
  },

  remove: (id) => {
    set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }));
  },
}));
