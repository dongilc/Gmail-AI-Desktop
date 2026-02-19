import { contextBridge, ipcRenderer, shell } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // 외부 링크 열기
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // Auth
  login: () => ipcRenderer.invoke('auth:login'),
  logout: (accountId: string) => ipcRenderer.invoke('auth:logout', accountId),
  getAccounts: () => ipcRenderer.invoke('auth:get-accounts'),
  refreshToken: (accountId: string) => ipcRenderer.invoke('auth:refresh-token', accountId),

  // Gmail
  getMessages: (accountId: string, options: any) =>
    ipcRenderer.invoke('gmail:get-messages', accountId, options),
  getMessage: (accountId: string, messageId: string) =>
    ipcRenderer.invoke('gmail:get-message', accountId, messageId),
  sendMessage: (accountId: string, draft: any) =>
    ipcRenderer.invoke('gmail:send-message', accountId, draft),
  createDraft: (accountId: string, draft: any) =>
    ipcRenderer.invoke('gmail:create-draft', accountId, draft),
  updateDraft: (accountId: string, draftId: string, draft: any) =>
    ipcRenderer.invoke('gmail:update-draft', accountId, draftId, draft),
  deleteDraft: (accountId: string, draftId: string) =>
    ipcRenderer.invoke('gmail:delete-draft', accountId, draftId),
  modifyMessage: (accountId: string, messageId: string, addLabels?: string[], removeLabels?: string[]) =>
    ipcRenderer.invoke('gmail:modify-message', accountId, messageId, addLabels, removeLabels),
  trashMessage: (accountId: string, messageId: string) =>
    ipcRenderer.invoke('gmail:trash-message', accountId, messageId),
  searchMessages: (accountId: string, query: string, maxResults?: number) =>
    ipcRenderer.invoke('gmail:search', accountId, query, maxResults),
  getAttachment: (accountId: string, messageId: string, attachmentId: string) =>
    ipcRenderer.invoke('gmail:get-attachment', accountId, messageId, attachmentId),
  downloadAttachment: (accountId: string, messageId: string, attachmentId: string, filename: string) =>
    ipcRenderer.invoke('gmail:download-attachment', accountId, messageId, attachmentId, filename),
  previewOfficeAttachment: (accountId: string, messageId: string, attachmentId: string, filename: string) =>
    ipcRenderer.invoke('gmail:preview-office-attachment', accountId, messageId, attachmentId, filename),
  syncEmails: (accountId: string) =>
    ipcRenderer.invoke('gmail:sync', accountId),

  // Cache
  refreshCache: (accountId: string) => ipcRenderer.invoke('cache:refresh', accountId),
  clearAllCache: () => ipcRenderer.invoke('cache:clear-all'),
  getCacheInfo: (accountId: string) => ipcRenderer.invoke('cache:get-info', accountId),

  // Calendar
  getEvents: (accountId: string, timeMin: Date, timeMax: Date) =>
    ipcRenderer.invoke('calendar:get-events', accountId, timeMin.toISOString(), timeMax.toISOString()),
  createEvent: (accountId: string, event: any) =>
    ipcRenderer.invoke('calendar:create-event', accountId, event),
  updateEvent: (accountId: string, event: any) =>
    ipcRenderer.invoke('calendar:update-event', accountId, event),
  deleteEvent: (accountId: string, eventId: string) =>
    ipcRenderer.invoke('calendar:delete-event', accountId, eventId),

  // Tasks
  getTaskLists: (accountId: string) =>
    ipcRenderer.invoke('tasks:get-lists', accountId),
  getTasks: (accountId: string, taskListId: string) =>
    ipcRenderer.invoke('tasks:get-tasks', accountId, taskListId),
  createTask: (accountId: string, taskListId: string, task: any) =>
    ipcRenderer.invoke('tasks:create-task', accountId, taskListId, task),
  updateTask: (accountId: string, taskListId: string, task: any) =>
    ipcRenderer.invoke('tasks:update-task', accountId, taskListId, task),
  deleteTask: (accountId: string, taskListId: string, taskId: string) =>
    ipcRenderer.invoke('tasks:delete-task', accountId, taskListId, taskId),
  moveTask: (accountId: string, taskListId: string, taskId: string, previousTaskId?: string) =>
    ipcRenderer.invoke('tasks:move-task', accountId, taskListId, taskId, previousTaskId),

  // Print / PDF
  printHtml: (html: string) => ipcRenderer.invoke('app:print-html', html),
  printToPdf: (html: string, filenameBase?: string) =>
    ipcRenderer.invoke('app:print-to-pdf', html, filenameBase),

  // AI
  summarizeEmail: (accountId: string, emailId: string) =>
    ipcRenderer.invoke('ai:summarize-email', accountId, emailId),
  aiSearchWeatherLocations: (payload: { query: string; language: 'ko' | 'en' }) =>
    ipcRenderer.invoke('ai:search-weather-locations', payload),
  aiGetWeather: (payload: { location: string; language: 'ko' | 'en'; latitude?: number; longitude?: number }) =>
    ipcRenderer.invoke('ai:get-weather', payload),
  aiGetNews: (payload: { keyword: string; language: 'ko' | 'en'; force?: boolean }) =>
    ipcRenderer.invoke('ai:get-news', payload),
  aiHealth: () => ipcRenderer.invoke('ai:health'),
  aiSetConfig: (config: { baseUrl?: string; model?: string; temperature?: number; numPredict?: number }) =>
    ipcRenderer.invoke('ai:set-config', config),
  aiListModels: () => ipcRenderer.invoke('ai:list-models'),
  aiParseSchedule: (payload: { text: string; baseDate?: string }) =>
    ipcRenderer.invoke('ai:parse-schedule', payload),
  aiGenerate: (payload: { prompt: string }) => ipcRenderer.invoke('ai:generate', payload),
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      // Auth
      login: () => Promise<any>;
      logout: (accountId: string) => Promise<void>;
      getAccounts: () => Promise<any[]>;
      refreshToken: (accountId: string) => Promise<string>;

      // Gmail
      getMessages: (accountId: string, options: any) => Promise<any>;
      getMessage: (accountId: string, messageId: string) => Promise<any>;
      sendMessage: (accountId: string, draft: any) => Promise<any>;
      createDraft: (accountId: string, draft: any) => Promise<{ id: string; messageId?: string }>;
      updateDraft: (accountId: string, draftId: string, draft: any) => Promise<void>;
      deleteDraft: (accountId: string, draftId: string) => Promise<void>;
      modifyMessage: (accountId: string, messageId: string, addLabels?: string[], removeLabels?: string[]) => Promise<void>;
      trashMessage: (accountId: string, messageId: string) => Promise<void>;
      searchMessages: (accountId: string, query: string, maxResults?: number) => Promise<any>;
      getAttachment: (accountId: string, messageId: string, attachmentId: string) => Promise<{ data: string }>;
      downloadAttachment: (accountId: string, messageId: string, attachmentId: string, filename: string) => Promise<{ success: boolean; path?: string }>;
      previewOfficeAttachment: (
        accountId: string,
        messageId: string,
        attachmentId: string,
        filename: string
      ) => Promise<{ ok: boolean; data?: string; filename?: string; reason?: string }>;
      syncEmails: (accountId: string) => Promise<any>;

      // Cache
      refreshCache: (accountId: string) => Promise<void>;
      clearAllCache: () => Promise<void>;
      getCacheInfo: (accountId: string) => Promise<{ emailCount: number; lastSync: number; historyId?: string; initialSyncComplete: boolean }>;

      // Calendar
      getEvents: (accountId: string, timeMin: Date, timeMax: Date) => Promise<any[]>;
      createEvent: (accountId: string, event: any) => Promise<any>;
      updateEvent: (accountId: string, event: any) => Promise<any>;
      deleteEvent: (accountId: string, eventId: string) => Promise<void>;

      // Tasks
      getTaskLists: (accountId: string) => Promise<any[]>;
      getTasks: (accountId: string, taskListId: string) => Promise<any[]>;
      createTask: (accountId: string, taskListId: string, task: any) => Promise<any>;
      updateTask: (accountId: string, taskListId: string, task: any) => Promise<any>;
      deleteTask: (accountId: string, taskListId: string, taskId: string) => Promise<void>;
      moveTask: (accountId: string, taskListId: string, taskId: string, previousTaskId?: string) => Promise<any>;

      // Print / PDF
      printHtml: (html: string) => Promise<void>;
      printToPdf: (html: string, filenameBase?: string) => Promise<{ success?: boolean; canceled?: boolean; path?: string }>;

      // AI
      summarizeEmail: (accountId: string, emailId: string) => Promise<{ summaryLines: string[]; actions: any[]; generatedAt?: string }>;
      aiSearchWeatherLocations: (payload: { query: string; language: 'ko' | 'en' }) => Promise<
        Array<{ name: string; admin1?: string; country?: string; latitude?: number; longitude?: number }>
      >;
      aiGetWeather: (payload: { location: string; language: 'ko' | 'en'; latitude?: number; longitude?: number }) => Promise<{ text: string }>;
      aiGetNews: (payload: { keyword: string; language: 'ko' | 'en'; force?: boolean }) => Promise<{ text: string }>;
      aiHealth: () => Promise<{ ok: boolean }>;
      aiSetConfig: (config: { baseUrl?: string; model?: string; temperature?: number; numPredict?: number }) => Promise<{ baseUrl: string; model: string; temperature: number; numPredict: number }>;
      aiListModels: () => Promise<string[]>;
      aiParseSchedule: (payload: { text: string; baseDate?: string }) => Promise<{ title: string; location: string; startLocal: string; endLocal: string; allDay: boolean; promptTokens?: number; evalTokens?: number } | null>;
      aiGenerate: (payload: { prompt: string }) => Promise<{ text: string; promptTokens?: number; evalTokens?: number }>;
    };
  }
}
