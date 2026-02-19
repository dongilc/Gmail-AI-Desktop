// 계정 관련 타입
export interface Account {
  id: string;
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
}

// 이메일 관련 타입
export interface Email {
  id: string;
  threadId: string;
  accountId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  snippet: string;
  body: string;
  bodyHtml?: string;
  date: Date;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  labels: string[];
  attachments?: Attachment[];
  summary?: EmailSummary;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  data: string; // base64 encoded
}

export interface EmailDraft {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  replyToMessageId?: string;
  threadId?: string;
  attachments?: EmailAttachment[];
}

export type EmailActionType = 'submit' | 'meeting' | 'payment' | 'reservation' | 'review' | 'approval' | 'survey' | 'other';

export interface EmailAction {
  type: EmailActionType;
  label: string;
  dueDate?: Date;
  confidence?: number;
}

export interface EmailSummary {
  summaryLines: string[];
  actions: EmailAction[];
  generatedAt?: Date;
  promptTokens?: number;
  evalTokens?: number;
}


// 캘린더 관련 타입
export interface CalendarEvent {
  id: string;
  accountId: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color?: string;
  attendees?: Attendee[];
  reminders?: Reminder[];
}

export interface Attendee {
  email: string;
  name?: string;
  responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
}

export interface Reminder {
  method: 'email' | 'popup';
  minutes: number;
}

// 할 일 관련 타입
export interface Task {
  id: string;
  accountId: string;
  taskListId: string;
  title: string;
  notes?: string;
  due?: Date;
  completed: boolean;
  completedDate?: Date;
  position: string;
  parent?: string;
  emailLink?: {
    messageId: string;
    subject: string;
    from: string;
  };
}

export interface TaskList {
  id: string;
  title: string;
  accountId: string;
}

// UI 관련 타입
export type ViewType = 'inbox' | 'unread' | 'sent' | 'starred' | 'important' | 'drafts' | 'trash' | 'spam' | 'all';

export interface AppState {
  currentAccountId: string | null;
  selectedEmailId: string | null;
  currentView: ViewType;
  isComposing: boolean;
  searchQuery: string;
}

// IPC 통신 타입
export interface IpcChannels {
  // Auth
  'auth:login': () => Promise<Account>;
  'auth:logout': (accountId: string) => Promise<void>;
  'auth:refresh-token': (accountId: string) => Promise<string>;
  'auth:get-accounts': () => Promise<Account[]>;

  // Gmail
  'gmail:get-messages': (accountId: string, options: { labelIds?: string[], maxResults?: number, pageToken?: string }) => Promise<{ messages: Email[], nextPageToken?: string }>;
  'gmail:get-message': (accountId: string, messageId: string) => Promise<Email>;
  'gmail:send-message': (accountId: string, draft: EmailDraft) => Promise<{ id: string }>;
  'gmail:create-draft': (accountId: string, draft: EmailDraft) => Promise<{ id: string; messageId?: string }>;
  'gmail:update-draft': (accountId: string, draftId: string, draft: EmailDraft) => Promise<void>;
  'gmail:delete-draft': (accountId: string, draftId: string) => Promise<void>;
  'gmail:modify-message': (accountId: string, messageId: string, addLabels?: string[], removeLabels?: string[]) => Promise<void>;
  'gmail:trash-message': (accountId: string, messageId: string) => Promise<void>;

  // Calendar
  'calendar:get-events': (accountId: string, timeMin: Date, timeMax: Date) => Promise<CalendarEvent[]>;
  'calendar:create-event': (accountId: string, event: Partial<CalendarEvent>) => Promise<CalendarEvent>;
  'calendar:update-event': (accountId: string, event: CalendarEvent) => Promise<CalendarEvent>;
  'calendar:delete-event': (accountId: string, eventId: string) => Promise<void>;

  // Tasks
  'tasks:get-lists': (accountId: string) => Promise<TaskList[]>;
  'tasks:get-tasks': (accountId: string, taskListId: string) => Promise<Task[]>;
  'tasks:create-task': (accountId: string, taskListId: string, task: Partial<Task>) => Promise<Task>;
  'tasks:update-task': (accountId: string, taskListId: string, task: Task) => Promise<Task>;
  'tasks:delete-task': (accountId: string, taskListId: string, taskId: string) => Promise<void>;

  // Print / PDF
  'app:print-html': (html: string) => Promise<void>;
  'app:print-to-pdf': (html: string, filenameBase?: string) => Promise<{ success?: boolean; canceled?: boolean; path?: string }>;

  // AI
  'ai:summarize-email': (accountId: string, emailId: string) => Promise<EmailSummary>;
  'ai:health': () => Promise<{ ok: boolean }>;
  'ai:set-config': (config: { baseUrl?: string; model?: string; temperature?: number; numPredict?: number }) => Promise<{ baseUrl: string; model: string; temperature: number; numPredict: number }>;
  'ai:list-models': () => Promise<string[]>;
  'ai:parse-schedule': (payload: { text: string; baseDate?: string }) => Promise<{
    title: string;
    location: string;
    startLocal: string;
    endLocal: string;
    allDay: boolean;
    promptTokens?: number;
    evalTokens?: number;
  } | null>;
  'ai:generate': (payload: { prompt: string }) => Promise<{ text: string; promptTokens?: number; evalTokens?: number }>;
}
