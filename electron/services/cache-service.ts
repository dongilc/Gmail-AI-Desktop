import Store from 'electron-store';
import type { EmailSummary } from '../../src/types';

interface CachedEmail {
  id: string;
  threadId: string;
  accountId: string;
  from: { name?: string; email: string };
  to: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  bcc?: { name?: string; email: string }[];
  subject: string;
  snippet: string;
  body: string;
  bodyHtml?: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  labels: string[];
  attachments?: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }[];
  summary?: EmailSummary;
}

interface CacheData {
  emails: Record<string, CachedEmail[]>; // accountId -> emails
  lastSync: Record<string, number>; // accountId -> timestamp
  pageTokens: Record<string, string | undefined>; // accountId -> nextPageToken
  historyIds: Record<string, string>; // accountId -> lastHistoryId
  initialSyncComplete: Record<string, boolean>; // accountId -> boolean
}

const store = new Store<CacheData>({
  projectName: 'Gmail Desktop',
  name: 'email-cache',
  defaults: {
    emails: {},
    lastSync: {},
    pageTokens: {},
    historyIds: {},
    initialSyncComplete: {},
  },
});

export const cacheService = {
  // 이메일 목록 저장
  saveEmails(accountId: string, emails: CachedEmail[], append: boolean = false): void {
    const existing = append ? store.get(`emails.${accountId}`, []) : [];
    const combined = append ? [...existing, ...emails] : emails;

    // 중복 제거
    const unique = combined.reduce((acc, email) => {
      if (!acc.find(e => e.id === email.id)) {
        acc.push(email);
      }
      return acc;
    }, [] as CachedEmail[]);

    store.set(`emails.${accountId}`, unique);
    store.set(`lastSync.${accountId}`, Date.now());
  },

  // 이메일 목록 가져오기
  getEmails(accountId: string): CachedEmail[] {
    return store.get(`emails.${accountId}`, []);
  },

  // 단일 이메일 업데이트
  updateEmail(accountId: string, email: CachedEmail): void {
    const emails = this.getEmails(accountId);
    const index = emails.findIndex(e => e.id === email.id);
    if (index >= 0) {
      emails[index] = email;
      store.set(`emails.${accountId}`, emails);
    }
  },

  // 이메일 삭제
  removeEmail(accountId: string, emailId: string): void {
    const emails = this.getEmails(accountId);
    const filtered = emails.filter(e => e.id !== emailId);
    store.set(`emails.${accountId}`, filtered);
  },

  // 여러 이메일 추가 (증분 동기화용)
  addEmails(accountId: string, newEmails: CachedEmail[]): void {
    const emails = this.getEmails(accountId);
    const existingIds = new Set(emails.map(e => e.id));
    const toAdd = newEmails.filter(e => !existingIds.has(e.id));
    if (toAdd.length > 0) {
      store.set(`emails.${accountId}`, [...toAdd, ...emails]);
    }
  },

  // 여러 이메일 삭제 (증분 동기화용)
  removeEmails(accountId: string, emailIds: string[]): void {
    if (emailIds.length === 0) return;
    const idsToRemove = new Set(emailIds);
    const emails = this.getEmails(accountId);
    const filtered = emails.filter(e => !idsToRemove.has(e.id));
    store.set(`emails.${accountId}`, filtered);
  },

  // 이메일 라벨 업데이트 (증분 동기화용)
  updateEmailLabels(accountId: string, emailId: string, addLabels: string[], removeLabels: string[]): void {
    const emails = this.getEmails(accountId);
    const email = emails.find(e => e.id === emailId);
    if (!email) return;

    const labelSet = new Set(email.labels);
    for (const l of addLabels) labelSet.add(l);
    for (const l of removeLabels) labelSet.delete(l);
    email.labels = Array.from(labelSet);

    // 파생 필드 업데이트
    email.isRead = !labelSet.has('UNREAD');
    email.isStarred = labelSet.has('STARRED');
    email.isImportant = labelSet.has('IMPORTANT');

    this.updateEmail(accountId, email);
  },

  // 마지막 동기화 시간 가져오기
  getLastSync(accountId: string): number {
    return store.get(`lastSync.${accountId}`, 0);
  },

  // historyId 저장
  saveHistoryId(accountId: string, historyId: string): void {
    store.set(`historyIds.${accountId}`, historyId);
  },

  // historyId 가져오기
  getHistoryId(accountId: string): string | undefined {
    return store.get(`historyIds.${accountId}`);
  },

  // 초기 동기화 완료 표시
  setInitialSyncComplete(accountId: string, complete: boolean): void {
    store.set(`initialSyncComplete.${accountId}`, complete);
  },

  // 초기 동기화 완료 여부
  isInitialSyncComplete(accountId: string): boolean {
    return store.get(`initialSyncComplete.${accountId}`, false);
  },

  // 페이지 토큰 저장
  savePageToken(accountId: string, token: string | undefined): void {
    if (token === undefined) {
      store.delete(`pageTokens.${accountId}` as any);
    } else {
      store.set(`pageTokens.${accountId}`, token);
    }
  },

  // 페이지 토큰 가져오기
  getPageToken(accountId: string): string | undefined {
    return store.get(`pageTokens.${accountId}`);
  },

  // 특정 계정 캐시 삭제
  clearAccount(accountId: string): void {
    store.delete(`emails.${accountId}` as any);
    store.delete(`lastSync.${accountId}` as any);
    store.delete(`pageTokens.${accountId}` as any);
    store.delete(`historyIds.${accountId}` as any);
    store.delete(`initialSyncComplete.${accountId}` as any);
  },

  // 전체 캐시 삭제
  clearAll(): void {
    store.clear();
  },
};
