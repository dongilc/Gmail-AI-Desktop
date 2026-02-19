import { create } from 'zustand';
import { Account } from '../types';
import { usePreferencesStore } from './preferences';

interface AccountsState {
  accounts: Account[];
  currentAccountId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  removeAccount: (accountId: string) => void;
  setCurrentAccount: (accountId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Async actions
  fetchAccounts: () => Promise<void>;
  login: () => Promise<void>;
  logout: (accountId: string) => Promise<void>;
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  currentAccountId: null,
  isLoading: false,
  error: null,

  setAccounts: (accounts) => set({ accounts }),

  addAccount: (account) =>
    set((state) => ({
      accounts: [...state.accounts.filter((a) => a.id !== account.id), account],
    })),

  removeAccount: (accountId) =>
    set((state) => ({
      accounts: state.accounts.filter((a) => a.id !== accountId),
      currentAccountId:
        state.currentAccountId === accountId
          ? state.accounts.find((a) => a.id !== accountId)?.id || null
          : state.currentAccountId,
    })),

  setCurrentAccount: (accountId) => {
    if (accountId) {
      localStorage.setItem('lastAccountId', accountId);
    }
    set({ currentAccountId: accountId });
  },

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  fetchAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const accounts = await window.electronAPI.getAccounts();
      const { accountOrder, primaryAccountId } = usePreferencesStore.getState();

      // 주계정 먼저, 그 다음 설정된 순서대로 정렬, 없으면 이메일 알파벳 순
      accounts.sort((a: Account, b: Account) => {
        // 주계정이 항상 맨 앞
        if (a.id === primaryAccountId) return -1;
        if (b.id === primaryAccountId) return 1;

        // 그 다음 설정된 순서대로
        if (accountOrder.length > 0) {
          const aIndex = accountOrder.indexOf(a.id);
          const bIndex = accountOrder.indexOf(b.id);
          if (aIndex === -1 && bIndex === -1) return a.email.localeCompare(b.email);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        }

        // 기본: 이메일 알파벳 순
        return a.email.localeCompare(b.email);
      });

      // 주계정 > 마지막 선택 계정 > 첫 번째 계정 순으로 선택
      const validPrimaryAccount = primaryAccountId && accounts.find((a: Account) => a.id === primaryAccountId);
      const lastAccountId = localStorage.getItem('lastAccountId');
      const validLastAccount = lastAccountId && accounts.find((a: Account) => a.id === lastAccountId);
      const currentAccountId = validPrimaryAccount
        ? primaryAccountId
        : validLastAccount
          ? lastAccountId
          : (accounts.length > 0 ? accounts[0].id : null);

      set({
        accounts,
        currentAccountId,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '계정 목록을 불러오는데 실패했습니다.',
        isLoading: false,
      });
    }
  },

  login: async () => {
    set({ isLoading: true, error: null });
    try {
      const account = await window.electronAPI.login();
      const { accounts } = get();
      set({
        accounts: [...accounts.filter((a) => a.id !== account.id), account],
        currentAccountId: account.id,
        isLoading: false,
      });
      // 계정 추가 후 자동 reload
      window.location.reload();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '로그인에 실패했습니다.',
        isLoading: false,
      });
    }
  },

  logout: async (accountId) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI.logout(accountId);
      get().removeAccount(accountId);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '로그아웃에 실패했습니다.',
        isLoading: false,
      });
    }
  },
}));
