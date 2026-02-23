import { useEffect, useState } from "react";
import { CheckSquare, Plus, Loader2, Mail, ExternalLink, Info, ArrowDownUp, Trash2, Pencil, GripVertical, RefreshCw } from "lucide-react";
import { useAccountsStore } from "@/stores/accounts";
import { useTasksStore } from "@/stores/tasks";
import { useEmailsStore } from "@/stores/emails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, getDueDateLabel } from "@/lib/utils";
import { playTodoCompleteSound } from "@/lib/sounds";
import type { Task } from "@/types";
import { usePreferencesStore } from "@/stores/preferences";

const LABEL_TODO = "\uC624\uB298 \uD560 \uC77C";
const LABEL_REMAINING = "\uAC1C \uB0A8\uC74C";
const LABEL_ADD_PLACEHOLDER = "\uD560 \uC77C \uCD94\uAC00...";
const LABEL_LOADING = "\uB85C\uB529 \uC911...";
const LABEL_EMPTY = "\uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4";
const LABEL_COMPLETED = "\uC644\uB8CC\uB428";
const LABEL_DETAIL_TITLE = "\uD560 \uC77C \uC0C1\uC138";
const LABEL_IN_PROGRESS = "\uC9C4\uD589 \uC911";
const LABEL_TITLE = "\uC81C\uBAA9";
const LABEL_NOTES = "\uB0B4\uC6A9";
const LABEL_DUE = "\uB9C8\uAC10";
const LABEL_LINKED_EMAIL = "\uC5F0\uACB0\uB41C \uBA54\uC77C";
const LABEL_VIEW_DETAIL = "\uC0C1\uC138\uBCF4\uAE30";
const LABEL_OPEN_EMAIL = "\uBA54\uC77C \uC5F4\uAE30";
const LABEL_OPEN_LINKED_EMAIL = "\uC5F0\uACB0\uB41C \uBA54\uC77C \uC5F4\uAE30";
const LABEL_SORT = "\uC815\uB82C";
const LABEL_SORT_CREATED = "\uC0DD\uC131\uC21C";
const LABEL_SORT_DUE = "\uB9C8\uAC10\uC784\uBC15\uC21C";
const LABEL_SORT_ASC = "\uC624\uB984\uCC28\uC21C";
const LABEL_SORT_DESC = "\uB0B4\uB9BC\uCC28\uC21C";
const LABEL_EDIT = "\uC218\uC815";
const LABEL_DELETE = "\uC0AD\uC81C";
const LABEL_CANCEL = "\uCDE8\uC18C";
const LABEL_DELETE_CONFIRM_TITLE = "\uC0AD\uC81C \uD655\uC778";
const LABEL_DELETE_CONFIRM_DESC = "\uC774 \uD560 \uC77C\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?";
const LABEL_DELETE_CONFIRM_BUTTON = "\uC0AD\uC81C\uD558\uAE30";

export function TodoList() {
  const { currentAccountId } = useAccountsStore();
  const {
    tasks,
    selectedTaskListId,
    isLoading,
    fetchTaskLists,
    fetchTasks,
    createTask,
    saveTask,
    deleteTask,
    toggleComplete,
    moveTask,
    reorderTasks,
  } = useTasksStore();
  const { todoCompleteSound } = usePreferencesStore();

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDue, setEditDue] = useState("");
  const [sortKey, setSortKey] = useState<"created" | "due">("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!currentAccountId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchTaskLists(currentAccountId);
      if (selectedTaskListId) {
        await fetchTasks(currentAccountId, selectedTaskListId);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const toLocalInputValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  useEffect(() => {
    if (currentAccountId) {
      fetchTaskLists(currentAccountId);
    }
  }, [currentAccountId, fetchTaskLists]);

  const currentTasks = selectedTaskListId ? tasks[selectedTaskListId] || [] : [];
  const sortTasks = (list: Task[]) => {
    const items = [...list];
    const dir = sortDir === "asc" ? 1 : -1;

    if (sortKey === "due") {
      items.sort((a, b) => {
        const aTime = a.due ? new Date(a.due).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.due ? new Date(b.due).getTime() : Number.POSITIVE_INFINITY;
        if (aTime === bTime) return 0;
        return (aTime - bTime) * dir;
      });
      return items;
    }

    items.sort((a, b) => {
      const aPos = a.position || "";
      const bPos = b.position || "";
      return aPos.localeCompare(bPos) * dir;
    });

    return items;
  };

  const incompleteTasks = sortTasks(currentTasks.filter((t) => !t.completed));
  const completedTasks = sortTasks(currentTasks.filter((t) => t.completed));

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccountId || !selectedTaskListId || !newTaskTitle.trim()) return;

    setIsAdding(true);
    try {
      await createTask(currentAccountId, selectedTaskListId, {
        title: newTaskTitle.trim(),
      });
      setNewTaskTitle("");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = async (task: Task) => {
    if (!currentAccountId || !selectedTaskListId) return;
    const willComplete = !task.completed;
    await toggleComplete(currentAccountId, selectedTaskListId, task.id);
    if (willComplete) {
      playTodoCompleteSound(todoCompleteSound);
    }
  };

  const openEdit = (task: Task) => {
    setEditTask(task);
    setEditTitle(task.title || "");
    setEditNotes(task.notes || "");
    setEditDue(task.due ? toLocalInputValue(new Date(task.due)) : "");
  };

  const handleSaveEdit = async () => {
    if (!currentAccountId || !editTask) return;
    const title = editTitle.trim();
    if (!title) return;
    const updated: Task = {
      ...editTask,
      title,
      notes: editNotes.trim() || undefined,
      due: editDue ? new Date(editDue) : undefined,
    };
    await saveTask(currentAccountId, editTask.taskListId, updated);
    setDetailTask((prev) => (prev && prev.id === updated.id ? updated : prev));
    setEditTask(null);
  };

  const handleDelete = async (task: Task) => {
    if (!currentAccountId) return;
    await deleteTask(currentAccountId, task.taskListId, task.id);
    setDetailTask((prev) => (prev && prev.id === task.id ? null : prev));
    setDeleteTaskTarget((prev) => (prev && prev.id === task.id ? null : prev));
  };

  const requestDelete = (task: Task) => {
    setDeleteTaskTarget(task);
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    if (draggedTaskId && draggedTaskId !== taskId) {
      setDragOverTaskId(taskId);
    }
  };

  const handleDragLeave = () => {
    setDragOverTaskId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId || !currentAccountId || !selectedTaskListId) {
      setDraggedTaskId(null);
      setDragOverTaskId(null);
      return;
    }

    const draggedIndex = incompleteTasks.findIndex((t) => t.id === draggedTaskId);
    const targetIndex = incompleteTasks.findIndex((t) => t.id === targetTaskId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTaskId(null);
      setDragOverTaskId(null);
      return;
    }

    // 로컬 상태 먼저 업데이트 (즉각적인 피드백)
    const newOrder = [...incompleteTasks];
    const [removed] = newOrder.splice(draggedIndex, 1);

    // 드래그한 항목이 타겟보다 앞에 있었으면 인덱스 조정 필요
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newOrder.splice(adjustedTargetIndex, 0, removed);
    reorderTasks(selectedTaskListId, [...newOrder, ...completedTasks]);

    // API 호출 - 타겟 위치 바로 앞 태스크의 ID를 전달
    const previousTaskId = adjustedTargetIndex > 0 ? newOrder[adjustedTargetIndex - 1]?.id : undefined;
    try {
      await moveTask(currentAccountId, selectedTaskListId, draggedTaskId, previousTaskId);
    } catch (error) {
      // 실패 시 원래 상태로 복구
      fetchTasks(currentAccountId, selectedTaskListId);
    }

    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b">
        <CheckSquare className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{LABEL_TODO}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {incompleteTasks.length}
            {LABEL_REMAINING}
          </span>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground">{LABEL_SORT}</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as "created" | "due")}
              className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground"
            >
              <option value="created">{LABEL_SORT_CREATED}</option>
              <option value="due">{LABEL_SORT_DUE}</option>
            </select>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? LABEL_SORT_ASC : LABEL_SORT_DESC}
            >
              <ArrowDownUp className="h-3.5 w-3.5 mr-1" />
              {sortDir === "asc" ? LABEL_SORT_ASC : LABEL_SORT_DESC}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="새로고침"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleAddTask} className="p-3 border-b">
        <div className="flex gap-2">
          <Input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder={LABEL_ADD_PLACEHOLDER}
            className="h-8 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={isAdding || !newTaskTitle.trim()}
          >
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </form>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {isLoading && currentTasks.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-4">{LABEL_LOADING}</div>
          ) : incompleteTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-4">{LABEL_EMPTY}</div>
          ) : (
            <>
              {incompleteTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  accountId={currentAccountId}
                  onToggle={() => handleToggle(task)}
                  onOpenDetail={() => setDetailTask(task)}
                  onEdit={() => openEdit(task)}
                  onDelete={() => requestDelete(task)}
                  isDragging={draggedTaskId === task.id}
                  isDragOver={dragOverTaskId === task.id}
                  onDragStart={() => handleDragStart(task.id)}
                  onDragOver={(e) => handleDragOver(e, task.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, task.id)}
                  onDragEnd={handleDragEnd}
                />
              ))}

              {completedTasks.length > 0 && (
                <>
                  <div className="text-xs text-muted-foreground pt-3 pb-1">
                    {LABEL_COMPLETED} ({completedTasks.length})
                  </div>
                  {completedTasks.slice(0, 5).map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      accountId={currentAccountId}
                      onToggle={() => handleToggle(task)}
                      onOpenDetail={() => setDetailTask(task)}
                      onEdit={() => openEdit(task)}
                      onDelete={() => requestDelete(task)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <Dialog open={!!detailTask} onOpenChange={(open) => !open && setDetailTask(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{LABEL_DETAIL_TITLE}</DialogTitle>
            <DialogDescription>
              {detailTask?.completed ? LABEL_COMPLETED : LABEL_IN_PROGRESS}
            </DialogDescription>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground text-xs mb-1">{LABEL_TITLE}</div>
                <div className="whitespace-pre-wrap break-words">{detailTask.title}</div>
              </div>
              {detailTask.notes && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{LABEL_NOTES}</div>
                  <div className="whitespace-pre-wrap break-words">{detailTask.notes}</div>
                </div>
              )}
              {detailTask.due && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{LABEL_DUE}</div>
                  <div>{getDueDateLabel(new Date(detailTask.due))}</div>
                </div>
              )}
              {detailTask.emailLink && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{LABEL_LINKED_EMAIL}</div>
                  <div>{detailTask.emailLink.subject}</div>
                  <div className="text-muted-foreground text-xs">{detailTask.emailLink.from}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{"\uD560 \uC77C \uC218\uC815"}</DialogTitle>
          </DialogHeader>
          {editTask && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{LABEL_TITLE}</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={LABEL_TITLE}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{LABEL_NOTES}</label>
                <textarea
                  className="w-full min-h-[70px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={LABEL_NOTES}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{LABEL_DUE}</label>
                <Input
                  type="datetime-local"
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditTask(null)}>
                  {LABEL_CANCEL}
                </Button>
                <Button onClick={handleSaveEdit} disabled={!editTitle.trim()}>
                  {LABEL_EDIT}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTaskTarget} onOpenChange={(open) => !open && setDeleteTaskTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{LABEL_DELETE_CONFIRM_TITLE}</DialogTitle>
            <DialogDescription>{LABEL_DELETE_CONFIRM_DESC}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeleteTaskTarget(null)}>
              {LABEL_CANCEL}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTaskTarget && handleDelete(deleteTaskTarget)}
            >
              {LABEL_DELETE_CONFIRM_BUTTON}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskItem({
  task,
  accountId,
  onToggle,
  onOpenDetail,
  onEdit,
  onDelete,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  task: Task;
  accountId: string | null;
  onToggle: () => void;
  onOpenDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const { fetchEmail, setCurrentView, setScrollTargetEmailId, currentView, emailsByView, emails } = useEmailsStore();
  const isOverdue = task.due && !task.completed && new Date(task.due) < new Date();
  const hasDetail = !!task.notes || !!task.due || !!task.emailLink;

  const handleOpenEmail = async () => {
    if (task.emailLink?.messageId && accountId) {
      const viewEmails =
        emailsByView[accountId]?.[currentView] || emails[accountId] || [];
      const hasInCurrent = viewEmails.some((email) => email.id === task.emailLink?.messageId);
      if (!hasInCurrent) {
        setCurrentView("inbox");
      }
      setScrollTargetEmailId(task.emailLink.messageId);
      await fetchEmail(accountId, task.emailLink.messageId);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 group transition-all relative",
            task.completed && "opacity-50",
            isDragging && "opacity-30 scale-95"
          )}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* 드롭 인디케이터 라인 */}
          {isDragOver && (
            <div className="absolute -top-[2px] left-0 right-0 h-[4px] bg-primary rounded-full z-10 shadow-md animate-pulse">
              <div className="absolute -left-1 -top-[4px] w-3 h-3 bg-primary rounded-full border-2 border-background" />
            </div>
          )}
          {task.emailLink ? (
            <button
              onClick={handleOpenEmail}
              className="mt-0.5 p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
              title={LABEL_OPEN_LINKED_EMAIL}
            >
              <ExternalLink className="h-3.5 w-3.5 text-blue-500" />
            </button>
          ) : (
            <div className="w-4" />
          )}
          <Checkbox checked={task.completed} onCheckedChange={onToggle} className="mt-0.5" />
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm whitespace-normal break-words",
                task.completed && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {task.due && (
                <span className={cn("text-xs", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                  {getDueDateLabel(new Date(task.due))}
                </span>
              )}
              {hasDetail && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="h-3 w-3" />
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
            title={LABEL_DELETE}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
          {!task.completed && onDragStart && (
            <div
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
              title="드래그하여 순서 변경"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpenDetail}>
          <Info className="mr-2 h-4 w-4" />
          {LABEL_VIEW_DETAIL}
        </ContextMenuItem>
        <ContextMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          {LABEL_EDIT}
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
          {LABEL_DELETE}
        </ContextMenuItem>
        {task.emailLink && (
          <ContextMenuItem onClick={handleOpenEmail}>
            <Mail className="mr-2 h-4 w-4" />
            {LABEL_OPEN_EMAIL}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
