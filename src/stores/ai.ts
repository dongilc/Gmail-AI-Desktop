import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ServerStatus = 'checking' | 'online' | 'offline';

type QueuedTask = {
  id: string;
  execute: () => Promise<void>;
};

interface AiState {
  pendingCount: number;
  queuedCount: number;
  serverStatus: ServerStatus;
  completedTimestamps: number[];
  totalPromptTokens: number;
  totalEvalTokens: number;
  usageMonth: string;
  incrementPending: () => void;
  decrementPending: () => void;
  setQueuedCount: (value: number) => void;
  setServerStatus: (status: ServerStatus) => void;
  addCompleted: () => void;
  addTokens: (promptTokens: number, evalTokens: number) => void;
  ensureCurrentMonth: () => void;
  // 글로벌 작업 큐
  enqueueTask: (task: () => Promise<void>, maxConcurrent: number) => string;
  cancelTask: (taskId: string) => void;
}

const currentMonthKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// 글로벌 큐 (스토어 외부에서 관리)
let taskQueue: QueuedTask[] = [];
let activeCount = 0;
let taskIdCounter = 0;
let processingScheduled = false;

const processQueue = (maxConcurrent: number, get: () => AiState) => {
  if (processingScheduled) return;
  processingScheduled = true;

  setTimeout(() => {
    processingScheduled = false;

    while (activeCount < maxConcurrent && taskQueue.length > 0) {
      const task = taskQueue.shift();
      if (!task) break;

      activeCount++;
      get().incrementPending();
      get().setQueuedCount(taskQueue.length);

      task.execute()
        .catch((err) => console.error('[AI Queue] Task failed:', err))
        .finally(() => {
          activeCount = Math.max(0, activeCount - 1);
          get().decrementPending();
          get().addCompleted();
          // 다음 작업 처리
          if (taskQueue.length > 0) {
            processQueue(maxConcurrent, get);
          }
        });
    }
  }, 0);
};

export const useAiStore = create<AiState>()(
  persist(
    (set, get) => ({
      pendingCount: 0,
      queuedCount: 0,
      serverStatus: 'checking',
      completedTimestamps: [],
      totalPromptTokens: 0,
      totalEvalTokens: 0,
      usageMonth: currentMonthKey(),
      ensureCurrentMonth: () => {
        const month = currentMonthKey();
        if (get().usageMonth === month) return;
        set({
          usageMonth: month,
          completedTimestamps: [],
          totalPromptTokens: 0,
          totalEvalTokens: 0,
        });
      },
      incrementPending: () => set((state) => ({ pendingCount: state.pendingCount + 1 })),
      decrementPending: () =>
        set((state) => ({ pendingCount: Math.max(0, state.pendingCount - 1) })),
      setQueuedCount: (value) => set({ queuedCount: Math.max(0, value) }),
      setServerStatus: (serverStatus) => set({ serverStatus }),
      addCompleted: () => {
        get().ensureCurrentMonth();
        set((state) => {
          const now = Date.now();
          const cutoff = now - 60_000;
          const trimmed = state.completedTimestamps.filter((ts) => ts >= cutoff);
          return { completedTimestamps: [...trimmed, now] };
        });
      },
      addTokens: (promptTokens, evalTokens) => {
        get().ensureCurrentMonth();
        set((state) => ({
          totalPromptTokens: state.totalPromptTokens + Math.max(0, promptTokens),
          totalEvalTokens: state.totalEvalTokens + Math.max(0, evalTokens),
        }));
      },
      enqueueTask: (execute, maxConcurrent) => {
        const taskId = `task-${++taskIdCounter}`;
        taskQueue.push({ id: taskId, execute });
        get().setQueuedCount(taskQueue.length);
        processQueue(maxConcurrent, get);
        return taskId;
      },
      cancelTask: (taskId) => {
        const index = taskQueue.findIndex((t) => t.id === taskId);
        if (index !== -1) {
          taskQueue.splice(index, 1);
          get().setQueuedCount(taskQueue.length);
        }
      },
    }),
    {
      name: 'gmail-desktop-ai-usage',
      partialize: (state) => ({
        completedTimestamps: state.completedTimestamps,
        totalPromptTokens: state.totalPromptTokens,
        totalEvalTokens: state.totalEvalTokens,
        usageMonth: state.usageMonth,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.ensureCurrentMonth();
        }
      },
    }
  )
);
