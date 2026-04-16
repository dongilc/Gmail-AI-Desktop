import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  // 계정 설정
  primaryAccountId: string | null;
  setPrimaryAccountId: (value: string | null) => void;
  accountOrder: string[];
  setAccountOrder: (value: string[]) => void;

  showEmailSummary: boolean;
  setShowEmailSummary: (value: boolean) => void;
  emailBodyAdjustLevel: 'off' | 'strong';
  setEmailBodyAdjustLevel: (value: 'off' | 'strong') => void;
  briefingLocation: string;
  setBriefingLocation: (value: string) => void;
  briefingLocationCoords: { lat: number; lon: number } | null;
  setBriefingLocationCoords: (value: { lat: number; lon: number } | null) => void;
  briefingLanguage: 'ko' | 'en';
  setBriefingLanguage: (value: 'ko' | 'en') => void;
  briefingNewsKeyword: string;
  setBriefingNewsKeyword: (value: string) => void;
  aiProvider: 'ollama' | 'openai';
  setAiProvider: (value: 'ollama' | 'openai') => void;
  aiApiKey: string;
  setAiApiKey: (value: string) => void;
  aiServerUrl: string;
  setAiServerUrl: (value: string) => void;
  aiModel: string;
  setAiModel: (value: string) => void;
  aiTemperature: number;
  setAiTemperature: (value: number) => void;
  aiNumPredict: number;
  setAiNumPredict: (value: number) => void;
  aiMonthlyTokenCap: number;
  setAiMonthlyTokenCap: (value: number) => void;
  todoCompleteSound: 'soft' | 'softShort' | 'chime' | 'sparkle' | 'ding' | 'pop' | 'none';
  setTodoCompleteSound: (
    value: 'soft' | 'softShort' | 'chime' | 'sparkle' | 'ding' | 'pop' | 'none'
  ) => void;
  aiMailRecommendDays: number;
  setAiMailRecommendDays: (value: number) => void;
  aiMailRecommendEnabled: boolean;
  setAiMailRecommendEnabled: (value: boolean) => void;
  aiConcurrentTasks: number;
  setAiConcurrentTasks: (value: number) => void;
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (value: boolean) => void;
  autoRefreshInterval: number;
  setAutoRefreshInterval: (value: number) => void;
  downloadFolder: string;
  setDownloadFolder: (value: string) => void;
  accountSignatures: Record<string, string>;
  setAccountSignature: (accountId: string, signature: string) => void;
  removeAccountSignature: (accountId: string) => void;
  appTimezone: string;
  setAppTimezone: (value: string) => void;
  showRightPanel: boolean;
  setShowRightPanel: (value: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // 계정 설정
      primaryAccountId: null,
      setPrimaryAccountId: (value) => set({ primaryAccountId: value }),
      accountOrder: [],
      setAccountOrder: (value) => set({ accountOrder: value }),

      showEmailSummary: true,
      setShowEmailSummary: (value) => set({ showEmailSummary: value }),
      emailBodyAdjustLevel: 'strong',
      setEmailBodyAdjustLevel: (value) => set({ emailBodyAdjustLevel: value }),
      briefingLocation: 'Seoul',
      setBriefingLocation: (value) => set({ briefingLocation: value }),
      briefingLocationCoords: null,
      setBriefingLocationCoords: (value) => set({ briefingLocationCoords: value }),
      briefingLanguage: 'ko',
      setBriefingLanguage: (value) => set({ briefingLanguage: value }),
      briefingNewsKeyword: '\uAD6D\uC81C\uC774\uC288',
      setBriefingNewsKeyword: (value) => set({ briefingNewsKeyword: value }),
      aiProvider: 'ollama',
      setAiProvider: (value) => set({ aiProvider: value }),
      aiApiKey: '',
      setAiApiKey: (value) => set({ aiApiKey: value }),
      aiServerUrl: 'http://localhost:11434',
      setAiServerUrl: (value) => set({ aiServerUrl: value }),
      aiModel: 'llama3.1:8b',
      setAiModel: (value) => set({ aiModel: value }),
      aiTemperature: 0.2,
      setAiTemperature: (value) => set({ aiTemperature: value }),
      aiNumPredict: 1024,
      setAiNumPredict: (value) => set({ aiNumPredict: value }),
      aiMonthlyTokenCap: 50000,
      setAiMonthlyTokenCap: (value) => set({ aiMonthlyTokenCap: value }),
      todoCompleteSound: 'soft',
      setTodoCompleteSound: (value) => set({ todoCompleteSound: value }),
      aiMailRecommendDays: 30,
      setAiMailRecommendDays: (value) => set({ aiMailRecommendDays: value }),
      aiMailRecommendEnabled: true,
      setAiMailRecommendEnabled: (value) => set({ aiMailRecommendEnabled: value }),
      aiConcurrentTasks: 1,
      setAiConcurrentTasks: (value) => set({ aiConcurrentTasks: value }),
      autoRefreshEnabled: true,
      setAutoRefreshEnabled: (value) => set({ autoRefreshEnabled: value }),
      autoRefreshInterval: 5,
      setAutoRefreshInterval: (value) => set({ autoRefreshInterval: value }),
      downloadFolder: '',
      setDownloadFolder: (value) => set({ downloadFolder: value }),
      accountSignatures: {},
      setAccountSignature: (accountId, signature) =>
        set((state) => ({
          accountSignatures: { ...state.accountSignatures, [accountId]: signature },
        })),
      appTimezone: 'auto',
      setAppTimezone: (value) => set({ appTimezone: value || 'auto' }),
      showRightPanel: true,
      setShowRightPanel: (value) => set({ showRightPanel: value }),
      removeAccountSignature: (accountId) =>
        set((state) => {
          const next = { ...state.accountSignatures };
          delete next[accountId];
          return { accountSignatures: next };
        }),
    }),
    {
      name: 'gmail-desktop-preferences',
      version: 16,
      migrate: (state: any, _version) => {
        if (!state) return state;
        let next = { ...state };
        if (next.aiProvider !== 'ollama' && next.aiProvider !== 'openai') {
          next.aiProvider = 'ollama';
        }
        if (typeof next.aiApiKey !== 'string') {
          next.aiApiKey = '';
        }
        if (typeof next.showRightPanel !== 'boolean') {
          next.showRightPanel = true;
        }
        if (next.primaryAccountId === undefined) {
          next.primaryAccountId = null;
        }
        if (!Array.isArray(next.accountOrder)) {
          next.accountOrder = [];
        }
        if (next.aiNumPredict === undefined || next.aiNumPredict <= 200) {
          next.aiNumPredict = 1024;
        }
        if (next.aiMonthlyTokenCap === undefined || next.aiMonthlyTokenCap <= 0) {
          next.aiMonthlyTokenCap = 50000;
        }
        if (!next.briefingLocation) {
          next.briefingLocation = 'Seoul';
        }
        if (next.briefingLocationCoords === undefined) {
          next.briefingLocationCoords = null;
        }
        if (!next.briefingLanguage) {
          next.briefingLanguage = 'ko';
        }
        if (!next.briefingNewsKeyword) {
          next.briefingNewsKeyword = '\uAD6D\uC81C\uC774\uC288';
        }
        if (!next.todoCompleteSound) {
          next.todoCompleteSound = 'soft';
        }
        if (next.aiMailRecommendDays === undefined || next.aiMailRecommendDays === 7) {
          next.aiMailRecommendDays = 30;
        }
        if (next.aiMailRecommendEnabled === undefined) {
          next.aiMailRecommendEnabled = true;
        }
        if (next.aiConcurrentTasks === undefined || next.aiConcurrentTasks < 1) {
          next.aiConcurrentTasks = 1;
        }
        if (next.autoRefreshEnabled === undefined) {
          next.autoRefreshEnabled = true;
        }
        if (next.autoRefreshInterval === undefined || next.autoRefreshInterval < 1) {
          next.autoRefreshInterval = 5;
        }
        if (next.downloadFolder === undefined) {
          next.downloadFolder = '';
        }
        if (!next.accountSignatures || typeof next.accountSignatures !== 'object') {
          next.accountSignatures = {};
        }
        if (typeof next.appTimezone !== 'string' || !next.appTimezone) {
          next.appTimezone = 'auto';
        }
        return next;
      },
    }
  )
);
