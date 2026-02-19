import { create } from 'zustand';
import { Task, TaskList, Email } from '../types';

interface TasksState {
  taskLists: TaskList[];
  tasks: Record<string, Task[]>; // taskListId -> tasks
  selectedTaskListId: string | null;
  isLoading: boolean;
  error: string | null;

  // Quick Add Modal
  isQuickAddOpen: boolean;
  quickAddEmail: Email | null;

  // Actions
  setTaskLists: (lists: TaskList[]) => void;
  setTasks: (taskListId: string, tasks: Task[]) => void;
  addTask: (taskListId: string, task: Task) => void;
  updateTask: (taskListId: string, task: Task) => void;
  removeTask: (taskListId: string, taskId: string) => void;
  setSelectedTaskList: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Quick Add
  openQuickAdd: (email?: Email) => void;
  closeQuickAdd: () => void;

  // Async actions
  fetchTaskLists: (accountId: string) => Promise<void>;
  fetchTasks: (accountId: string, taskListId: string) => Promise<void>;
  createTask: (accountId: string, taskListId: string, task: Partial<Task>) => Promise<void>;
  createTaskFromEmail: (
    accountId: string,
    taskListId: string,
    email: Email,
    dueDate?: Date,
    titleOverride?: string
  ) => Promise<void>;
  saveTask: (accountId: string, taskListId: string, task: Task) => Promise<void>;
  toggleComplete: (accountId: string, taskListId: string, taskId: string) => Promise<void>;
  deleteTask: (accountId: string, taskListId: string, taskId: string) => Promise<void>;
  moveTask: (accountId: string, taskListId: string, taskId: string, previousTaskId?: string) => Promise<void>;
  reorderTasks: (taskListId: string, newOrder: Task[]) => void;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  taskLists: [],
  tasks: {},
  selectedTaskListId: null,
  isLoading: false,
  error: null,
  isQuickAddOpen: false,
  quickAddEmail: null,

  setTaskLists: (taskLists) =>
    set({
      taskLists,
      selectedTaskListId: taskLists.length > 0 ? taskLists[0].id : null,
    }),

  setTasks: (taskListId, tasks) =>
    set((state) => ({
      tasks: { ...state.tasks, [taskListId]: tasks },
    })),

  addTask: (taskListId, task) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskListId]: [task, ...(state.tasks[taskListId] || [])],
      },
    })),

  updateTask: (taskListId, updatedTask) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskListId]: (state.tasks[taskListId] || []).map((task) =>
          task.id === updatedTask.id ? updatedTask : task
        ),
      },
    })),

  removeTask: (taskListId, taskId) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskListId]: (state.tasks[taskListId] || []).filter((task) => task.id !== taskId),
      },
    })),

  setSelectedTaskList: (id) => set({ selectedTaskListId: id }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  openQuickAdd: (email) => set({ isQuickAddOpen: true, quickAddEmail: email || null }),

  closeQuickAdd: () => set({ isQuickAddOpen: false, quickAddEmail: null }),

  fetchTaskLists: async (accountId) => {
    set({ isLoading: true, error: null, tasks: {}, taskLists: [] });

    try {
      const lists = await window.electronAPI.getTaskLists(accountId);
      const listsWithAccount = lists.map((list: TaskList) => ({
        ...list,
        accountId,
      }));

      set({
        taskLists: listsWithAccount,
        selectedTaskListId: listsWithAccount.length > 0 ? listsWithAccount[0].id : null,
        isLoading: false,
      });

      // 첫 번째 목록의 할 일 불러오기
      if (listsWithAccount.length > 0) {
        get().fetchTasks(accountId, listsWithAccount[0].id);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '할 일 목록을 불러오는데 실패했습니다.',
        isLoading: false,
      });
    }
  },

  fetchTasks: async (accountId, taskListId) => {
    set({ isLoading: true, error: null });

    try {
      const tasks = await window.electronAPI.getTasks(accountId, taskListId);
      const tasksWithAccount = tasks.map((task: Task) => ({
        ...task,
        accountId,
        due: task.due ? new Date(task.due) : undefined,
        completedDate: task.completedDate ? new Date(task.completedDate) : undefined,
      }));

      // 완료되지 않은 항목을 먼저, 그 다음 마감일 순으로 정렬
      tasksWithAccount.sort((a: Task, b: Task) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        if (a.due && b.due) {
          return new Date(a.due).getTime() - new Date(b.due).getTime();
        }
        if (a.due) return -1;
        if (b.due) return 1;
        return 0;
      });

      set((state) => ({
        tasks: { ...state.tasks, [taskListId]: tasksWithAccount },
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '할 일을 불러오는데 실패했습니다.',
        isLoading: false,
      });
    }
  },

  createTask: async (accountId, taskListId, taskData) => {
    set({ isLoading: true, error: null });

    try {
      const task = await window.electronAPI.createTask(accountId, taskListId, taskData);
      const taskWithAccount = {
        ...task,
        accountId,
        due: task.due ? new Date(task.due) : undefined,
      };

      get().addTask(taskListId, taskWithAccount);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '할 일 생성에 실패했습니다.',
        isLoading: false,
      });
      throw error;
    }
  },

  createTaskFromEmail: async (accountId, taskListId, email, dueDate, titleOverride) => {
    const taskData: Partial<Task> = {
      title: titleOverride?.trim() || `[\uBA54\uC77C] ${email.subject}`,
      notes: `발신자: ${email.from.name || email.from.email}\n\n${email.snippet}`,
      due: dueDate,
      emailLink: {
        messageId: email.id,
        subject: email.subject,
        from: email.from.name || email.from.email,
      },
    };

    await get().createTask(accountId, taskListId, taskData);
    get().closeQuickAdd();
  },

  saveTask: async (accountId, taskListId, task) => {
    set({ isLoading: true, error: null });

    try {
      const updatedTask = await window.electronAPI.updateTask(accountId, taskListId, task);
      const taskWithAccount = {
        ...updatedTask,
        accountId,
        due: updatedTask.due ? new Date(updatedTask.due) : undefined,
        completedDate: updatedTask.completedDate ? new Date(updatedTask.completedDate) : undefined,
      };

      get().updateTask(taskListId, taskWithAccount);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '할 일 수정에 실패했습니다.',
        isLoading: false,
      });
      throw error;
    }
  },

  toggleComplete: async (accountId, taskListId, taskId) => {
    const tasks = get().tasks[taskListId] || [];
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedTask = {
      ...task,
      completed: !task.completed,
      completedDate: !task.completed ? new Date() : undefined,
    };

    await get().saveTask(accountId, taskListId, updatedTask);
  },

  deleteTask: async (accountId, taskListId, taskId) => {
    set({ isLoading: true, error: null });

    try {
      await window.electronAPI.deleteTask(accountId, taskListId, taskId);
      get().removeTask(taskListId, taskId);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '할 일 삭제에 실패했습니다.',
        isLoading: false,
      });
      throw error;
    }
  },

  moveTask: async (accountId, taskListId, taskId, previousTaskId) => {
    try {
      const result = await window.electronAPI.moveTask(accountId, taskListId, taskId, previousTaskId);
      const taskWithAccount = {
        ...result,
        accountId,
        due: result.due ? new Date(result.due) : undefined,
        completedDate: result.completedDate ? new Date(result.completedDate) : undefined,
      };
      get().updateTask(taskListId, taskWithAccount);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '할 일 이동에 실패했습니다.',
      });
      throw error;
    }
  },

  reorderTasks: (taskListId, newOrder) => {
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskListId]: newOrder,
      },
    }));
  },
}));
