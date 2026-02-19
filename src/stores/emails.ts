import { create } from 'zustand';
import { Email, ViewType, EmailDraft } from '../types';

const INITIAL_EMAIL_BATCH = 200;
const EMAIL_CHUNK_SIZE = 200;
const EMAIL_CHUNK_DELAY_MS = 80;
let emailChunkSeq = 0;
let emailChunkTimer: ReturnType<typeof setTimeout> | null = null;

interface EmailsState {
  // State
  emails: Record<string, Email[]>; // accountId -> emails
  emailsByView: Record<string, Partial<Record<ViewType, Email[]>>>; // accountId -> view -> emails
  selectedEmail: Email | null;
  currentView: ViewType;
  isComposing: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  searchQuery: string;
  pageTokens: Record<string, string | undefined>; // accountId -> nextPageToken
  manuallyMarkedUnread: Set<string>; // 명시적으로 안 읽음 표시한 이메일 ID들
  scrollTargetEmailId: string | null;

  // Actions
  setEmails: (accountId: string, emails: Email[]) => void;
  appendEmails: (accountId: string, emails: Email[]) => void;
  setSelectedEmail: (email: Email | null) => void;
  setCurrentView: (view: ViewType) => void;
  setComposing: (isComposing: boolean) => void;
  startCompose: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setPageToken: (accountId: string, token: string | undefined) => void;
  setScrollTargetEmailId: (emailId: string | null) => void;
  updateEmail: (accountId: string, email: Email) => void;
  removeEmail: (accountId: string, emailId: string) => void;

  // Async actions
  fetchEmails: (accountId: string, view?: ViewType) => Promise<void>;
  fetchMoreEmails: (accountId: string) => Promise<void>;
  fetchEmail: (accountId: string, emailId: string) => Promise<void>;
  sendEmail: (accountId: string, draft: EmailDraft) => Promise<void>;
  toggleStar: (accountId: string, emailId: string) => Promise<void>;
  toggleImportant: (accountId: string, emailId: string) => Promise<void>;
  markAsRead: (accountId: string, emailId: string) => Promise<void>;
  markAsUnread: (accountId: string, emailId: string) => Promise<void>;
  trashEmail: (accountId: string, emailId: string) => Promise<void>;
  markAsSpam: (accountId: string, emailId: string) => Promise<void>;
  searchEmails: (accountId: string, query: string) => Promise<void>;
  fetchEmailsForView: (accountId: string, view: ViewType) => Promise<void>;
}

const viewToLabels: Record<ViewType, string[]> = {
  inbox: ['INBOX'],
  unread: ['INBOX', 'UNREAD'],
  sent: ['SENT'],
  starred: ['STARRED'],
  important: ['IMPORTANT'],
  drafts: ['DRAFT'],
  trash: ['TRASH'],
  spam: ['SPAM'],
  all: [],
};

export const useEmailsStore = create<EmailsState>((set, get) => {
  const mergeCachedEmails = (accountId: string, list: Email[]) => {
    const cachedList = get().emails[accountId] || [];
    if (cachedList.length === 0) {
      return list.map((email) => ({ ...email, accountId }));
    }
    const cachedMap = new Map(cachedList.map((email) => [email.id, email]));
    return list.map((email) => {
      const cached = cachedMap.get(email.id);
      if (!cached) {
        return { ...email, accountId };
      }
      return {
        ...email,
        accountId,
        summary: cached.summary ?? email.summary,
        body: cached.body ?? email.body,
        bodyHtml: cached.bodyHtml ?? email.bodyHtml,
        attachments: cached.attachments ?? email.attachments,
      };
    });
  };

  return ({
  emails: {},
  emailsByView: {},
  selectedEmail: null,
  currentView: 'inbox',
  isComposing: false,
  isLoading: false,
  isSyncing: false,
  error: null,
  searchQuery: '',
  pageTokens: {},
  manuallyMarkedUnread: new Set<string>(),
  scrollTargetEmailId: null,

  setEmails: (accountId, emails) =>
    set((state) => ({
      emails: { ...state.emails, [accountId]: emails },
      emailsByView: {
        ...state.emailsByView,
        [accountId]: {
          ...(state.emailsByView[accountId] || {}),
          [state.currentView]: emails,
        },
      },
    })),

  appendEmails: (accountId, newEmails) =>
    set((state) => {
      const merged = [...(state.emails[accountId] || []), ...newEmails];
      return {
        emails: {
          ...state.emails,
          [accountId]: merged,
        },
        emailsByView: {
          ...state.emailsByView,
          [accountId]: {
            ...(state.emailsByView[accountId] || {}),
            [state.currentView]: merged,
          },
        },
      };
    }),

  setSelectedEmail: (email) =>
    set((state) => ({
      selectedEmail: email,
      isComposing: email ? false : state.isComposing,
    })),

  setCurrentView: (view) => set({ currentView: view }),

  setComposing: (isComposing) => set({ isComposing }),
  startCompose: () =>
    set(() => ({
      selectedEmail: null,
      isComposing: true,
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setPageToken: (accountId, token) =>
    set((state) => ({
      pageTokens: { ...state.pageTokens, [accountId]: token },
    })),

  setScrollTargetEmailId: (emailId) => set({ scrollTargetEmailId: emailId }),

  updateEmail: (accountId, updatedEmail) =>
    set((state) => {
      const selected = state.selectedEmail;
      const mergedForSelected =
        selected?.id === updatedEmail.id
          ? {
              ...selected,
              ...updatedEmail,
              body: updatedEmail.body || selected.body,
              bodyHtml: updatedEmail.bodyHtml || selected.bodyHtml,
              attachments: updatedEmail.attachments || selected.attachments,
            }
          : undefined;

      const mergeEmail = (email: Email): Email => {
        if (email.id !== updatedEmail.id) return email;
        const base = mergedForSelected || email;
        return {
          ...base,
          ...updatedEmail,
          body: updatedEmail.body || base.body,
          bodyHtml: updatedEmail.bodyHtml || base.bodyHtml,
          attachments: updatedEmail.attachments || base.attachments,
        };
      };

      const views = state.emailsByView[accountId] || {};
      const updatedViews: Partial<Record<ViewType, Email[]>> = {};
      (Object.keys(views) as ViewType[]).forEach((view) => {
        const list = views[view] || [];
        updatedViews[view] = list.map(mergeEmail);
      });

      const mergedSelected = mergedForSelected || selected;

      return {
        emails: {
          ...state.emails,
          [accountId]: (state.emails[accountId] || []).map(mergeEmail),
        },
        emailsByView: {
          ...state.emailsByView,
          [accountId]: { ...views, ...updatedViews },
        },
        selectedEmail: mergedSelected,
      };
    }),

  removeEmail: (accountId, emailId) =>
    set((state) => {
      const views = state.emailsByView[accountId] || {};
      const updatedViews: Partial<Record<ViewType, Email[]>> = {};
      (Object.keys(views) as ViewType[]).forEach((view) => {
        const list = views[view] || [];
        updatedViews[view] = list.filter((email) => email.id !== emailId);
      });
      return {
        emails: {
          ...state.emails,
          [accountId]: (state.emails[accountId] || []).filter((email) => email.id !== emailId),
        },
        emailsByView: {
          ...state.emailsByView,
          [accountId]: { ...views, ...updatedViews },
        },
        selectedEmail: state.selectedEmail?.id === emailId ? null : state.selectedEmail,
      };
    }),

  fetchEmails: async (accountId, view) => {
    const currentView = view || get().currentView;
    set({ currentView, error: null });

    const applyChunkedEmails = (emails: Email[], extraState?: Partial<EmailsState>) => {
      emailChunkSeq += 1;
      const seq = emailChunkSeq;
      if (emailChunkTimer) {
        clearTimeout(emailChunkTimer);
        emailChunkTimer = null;
      }

      const applyList = (list: Email[]) =>
        set((state) => ({
          emails: { ...state.emails, [accountId]: list },
          emailsByView: {
            ...state.emailsByView,
            [accountId]: {
              ...(state.emailsByView[accountId] || {}),
              [currentView]: list,
            },
          },
          ...extraState,
        }));

      if (emails.length <= INITIAL_EMAIL_BATCH) {
        applyList(emails);
        return;
      }

      const initial = emails.slice(0, INITIAL_EMAIL_BATCH);
      applyList(initial);

      let index = INITIAL_EMAIL_BATCH;
      const appendChunk = () => {
        if (seq != emailChunkSeq) return;
        if (get().currentView != currentView) return;
        const next = emails.slice(index, index + EMAIL_CHUNK_SIZE);
        if (next.length == 0) return;
        set((state) => {
          const existing = state.emails[accountId] || [];
          const merged = [...existing, ...next];
          return {
            emails: { ...state.emails, [accountId]: merged },
            emailsByView: {
              ...state.emailsByView,
              [accountId]: {
                ...(state.emailsByView[accountId] || {}),
                [currentView]: merged,
              },
            },
          };
        });
        index += EMAIL_CHUNK_SIZE;
        if (index < emails.length) {
          emailChunkTimer = setTimeout(appendChunk, EMAIL_CHUNK_DELAY_MS);
        }
      };

      emailChunkTimer = setTimeout(appendChunk, EMAIL_CHUNK_DELAY_MS);
    };

    try {
      // 1단계: 저장소에서 즉시 로드
      const labelIds = viewToLabels[currentView];
      const result = await window.electronAPI.getMessages(accountId, {
        labelIds: labelIds.length > 0 ? labelIds : undefined,
      });

      const emails = mergeCachedEmails(accountId, result.messages);

      if (emails.length > 0) {
        // ??? ???? ??? ?? ?? (chunked)
        applyChunkedEmails(emails, { isLoading: false });
      } else {
        // ??? ???? ??? ?? ??
        set({ isLoading: true });
      }


      // 2단계: 백그라운드에서 동기화
      set({ isSyncing: true });

      try {
        await window.electronAPI.syncEmails(accountId);

        // 3단계: 동기화 완료 후 저장소에서 재로드
        const updated = await window.electronAPI.getMessages(accountId, {
          labelIds: labelIds.length > 0 ? labelIds : undefined,
        });

        const updatedEmails = mergeCachedEmails(accountId, updated.messages);

        applyChunkedEmails(updatedEmails, { isLoading: false, isSyncing: false });
      } catch (syncError) {
        console.error('Sync failed:', syncError);
        set({ isSyncing: false, isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '이메일을 불러오는데 실패했습니다.',
        isLoading: false,
        isSyncing: false,
      });
    }
  },

  fetchMoreEmails: async (_accountId) => {
    // 증분 동기화 모델에서는 더 이상 페이지네이션 불필요
    // 전체 데이터가 저장소에 있으므로 no-op
  },

  fetchEmail: async (accountId, emailId) => {
    set({ isLoading: true, error: null });

    try {
      const email = await window.electronAPI.getMessage(accountId, emailId);
      const emailWithAccount = { ...email, accountId };
      set({ selectedEmail: emailWithAccount, isLoading: false });

      const existing = get().emails[accountId]?.find((e) => e.id === emailId);
      if (existing) {
        get().updateEmail(accountId, { ...existing, ...emailWithAccount });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load email.',
        isLoading: false,
      });
    }
  },

  sendEmail: async (accountId, draft) => {
    set({ isLoading: true, error: null });

    try {
      await window.electronAPI.sendMessage(accountId, draft);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '이메일 전송에 실패했습니다.',
        isLoading: false,
      });
      throw error;
    }
  },

  toggleStar: async (accountId, emailId) => {
    const emails = get().emails[accountId] || [];
    const email = emails.find((e) => e.id === emailId);
    if (!email) return;

    const newStarred = !email.isStarred;

    try {
      if (newStarred) {
        await window.electronAPI.modifyMessage(accountId, emailId, ['STARRED']);
      } else {
        await window.electronAPI.modifyMessage(accountId, emailId, undefined, ['STARRED']);
      }

      get().updateEmail(accountId, { ...email, isStarred: newStarred });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '별표 변경에 실패했습니다.',
      });
    }
  },

  toggleImportant: async (accountId, emailId) => {
    const emails = get().emails[accountId] || [];
    const email = emails.find((e) => e.id === emailId);
    if (!email) return;

    const newImportant = !email.isImportant;

    try {
      if (newImportant) {
        await window.electronAPI.modifyMessage(accountId, emailId, ['IMPORTANT']);
      } else {
        await window.electronAPI.modifyMessage(accountId, emailId, undefined, ['IMPORTANT']);
      }

      get().updateEmail(accountId, { ...email, isImportant: newImportant });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '중요 표시 변경에 실패했습니다.',
      });
    }
  },

  markAsRead: async (accountId, emailId) => {
    const emails = get().emails[accountId] || [];
    const email = emails.find((e) => e.id === emailId);
    if (!email || email.isRead) return;

    try {
      await window.electronAPI.modifyMessage(accountId, emailId, undefined, ['UNREAD']);
      get().updateEmail(accountId, { ...email, isRead: true });
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  },

  markAsUnread: async (accountId, emailId) => {
    const emails = get().emails[accountId] || [];
    const email = emails.find((e) => e.id === emailId);
    if (!email || !email.isRead) return;

    try {
      await window.electronAPI.modifyMessage(accountId, emailId, ['UNREAD'], undefined);
      get().updateEmail(accountId, { ...email, isRead: false });
      // 명시적으로 안 읽음 표시한 것으로 기록
      const newSet = new Set(get().manuallyMarkedUnread);
      newSet.add(emailId);
      set({ manuallyMarkedUnread: newSet });
    } catch (error) {
      console.error('Failed to mark as unread:', error);
    }
  },

  trashEmail: async (accountId, emailId) => {
    try {
      await window.electronAPI.trashMessage(accountId, emailId);
      get().removeEmail(accountId, emailId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '이메일 삭제에 실패했습니다.',
      });
    }
  },

  markAsSpam: async (accountId, emailId) => {
    try {
      const isSpamView = get().currentView === 'spam';
      if (isSpamView) {
        // 스팸 해제: INBOX 추가, SPAM 제거
        await window.electronAPI.modifyMessage(accountId, emailId, ['INBOX'], ['SPAM']);
      } else {
        // 스팸 처리: SPAM 추가, INBOX 제거
        await window.electronAPI.modifyMessage(accountId, emailId, ['SPAM'], ['INBOX']);
      }
      get().removeEmail(accountId, emailId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '스팸 처리에 실패했습니다.',
      });
    }
  },

  searchEmails: async (accountId, query) => {
    set({ isLoading: true, error: null, searchQuery: query });

    try {
      const emails = await window.electronAPI.searchMessages(accountId, query, 50);
      const emailsWithAccount = emails.map((email: Email) => ({
        ...email,
        accountId,
      }));

      set((state) => ({
        emails: { ...state.emails, [accountId]: emailsWithAccount },
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '검색에 실패했습니다.',
        isLoading: false,
      });
    }
  },

  fetchEmailsForView: async (accountId, view) => {
    try {
      const labelIds = viewToLabels[view];
      const result = await window.electronAPI.getMessages(accountId, {
        labelIds: labelIds.length > 0 ? labelIds : undefined,
      });

      const emails = mergeCachedEmails(accountId, result.messages);
      const currentView = get().currentView;

      set((state) => ({
        // 현재 뷰와 같으면 emails도 같이 업데이트 (카운트 동기화)
        emails: view === currentView
          ? { ...state.emails, [accountId]: emails }
          : state.emails,
        emailsByView: {
          ...state.emailsByView,
          [accountId]: {
            ...(state.emailsByView[accountId] || {}),
            [view]: emails,
          },
        },
      }));
    } catch (error) {
      // Avoid noisy UI errors for background count preload
      console.error('Failed to preload emails for view:', view, error);
    }
  },
});
});
