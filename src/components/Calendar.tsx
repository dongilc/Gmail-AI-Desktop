import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RefreshCw, Trash2, Pencil } from "lucide-react";
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  startOfDay,
  endOfDay,
  differenceInCalendarDays,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { ko } from "date-fns/locale";
import { useAccountsStore } from "@/stores/accounts";
import { useAiStore } from "@/stores/ai";
import { useCalendarStore } from "@/stores/calendar";
import { useTasksStore } from "@/stores/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, formatTime } from "@/lib/utils";
import type { Task } from "@/types";

const LABEL_DAY = "\uC77C";
const LABEL_WEEK = "\uC8FC";
const LABEL_MONTH = "\uC6D4";
const LABEL_TODAY = "\uC624\uB298";
const LABEL_LOADING = "\uB85C\uB529 \uC911...";
const LABEL_EMPTY = "\uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4";
const LABEL_ALL_DAY = "\uC885\uC77C";
const LABEL_EVENT = "\uC77C\uC815";
const LABEL_TASK = "\uD560\uC77C";
const LABEL_EDIT = "\uC218\uC815";
const LABEL_EDIT_EVENT = "\uC77C\uC815 \uC218\uC815";
const LABEL_TITLE = "\uC81C\uBAA9";
const LABEL_LOCATION = "\uC7A5\uC18C";
const LABEL_DESCRIPTION = "\uC124\uBA85";
const LABEL_START = "\uC2DC\uC791";
const LABEL_END = "\uC885\uB8CC";
const LABEL_CANCEL = "\uCDE8\uC18C";
const LABEL_TASK_EDIT = "\uD560 \uC77C \uC218\uC815";
const LABEL_DUE = "\uB9C8\uAC10";
const PLACEHOLDER_TITLE = "\uC77C\uC815 \uC81C\uBAA9";
const PLACEHOLDER_LOCATION = "\uC7A5\uC18C (\uC120\uD0DD)";
const PLACEHOLDER_DESCRIPTION = "\uC124\uBA85 (\uC120\uD0DD)";
const WEEKDAY_LABELS = [
  "\uC77C",
  "\uC6D4",
  "\uD654",
  "\uC218",
  "\uBAA9",
  "\uAE08",
  "\uD1A0",
];

type CalendarItem = {
  id: string;
  accountId?: string;
  calendarId?: string;
  taskId?: string;
  taskListId?: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  kind: "event" | "task";
  completed?: boolean;
};

export function Calendar() {
  const { currentAccountId } = useAccountsStore();
  const { incrementPending, decrementPending, addCompleted } = useAiStore();
  const {
    events,
    selectedDate,
    viewType,
    isLoading,
    setSelectedDate,
    setViewType,
    fetchEvents,
    createEvent,
    saveEvent,
    deleteEvent,
  } = useCalendarStore();
  const { taskLists, tasks, fetchTaskLists, fetchTasks, saveTask } = useTasksStore();
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalendarItem | null>(null);
  const [selectedMonthDay, setSelectedMonthDay] = useState<Date | null>(null);
  const [showEvents, setShowEvents] = useState(true);
  const [showTodos, setShowTodos] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createLocation, setCreateLocation] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createAllDay, setCreateAllDay] = useState(false);
  const [createStart, setCreateStart] = useState("");
  const [createEnd, setCreateEnd] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAllDay, setEditAllDay] = useState(false);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editTaskDialogOpen, setEditTaskDialogOpen] = useState(false);
  const [editTaskItem, setEditTaskItem] = useState<CalendarItem | null>(null);
  const [editTaskSource, setEditTaskSource] = useState<Task | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskNotes, setEditTaskNotes] = useState("");
  const [editTaskDue, setEditTaskDue] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (currentAccountId) {
      fetchEvents(currentAccountId);
    }
  }, [currentAccountId, selectedDate, viewType, fetchEvents]);

  useEffect(() => {
    if (currentAccountId) {
      fetchTaskLists(currentAccountId);
    }
  }, [currentAccountId, fetchTaskLists]);

  useEffect(() => {
    if (!currentAccountId) return;
    if (taskLists.length === 0) return;
    // 현재 계정의 태스크 리스트만 처리
    const currentAccountLists = taskLists.filter((list) => list.accountId === currentAccountId);
    currentAccountLists.forEach((list) => {
      fetchTasks(currentAccountId, list.id);
    });
  }, [currentAccountId, taskLists, fetchTasks]);

  useEffect(() => {
    if (isMonthOpen) {
      setSelectedMonthDay(selectedDate);
    }
  }, [isMonthOpen, selectedDate]);

  const handlePrev = () => {
    if (viewType === "day") setSelectedDate(addDays(selectedDate, -1));
    if (viewType === "week") setSelectedDate(addWeeks(selectedDate, -1));
    if (viewType === "month") setSelectedDate(addMonths(selectedDate, -1));
  };

  const handleNext = () => {
    if (viewType === "day") setSelectedDate(addDays(selectedDate, 1));
    if (viewType === "week") setSelectedDate(addWeeks(selectedDate, 1));
    if (viewType === "month") setSelectedDate(addMonths(selectedDate, 1));
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const handleRefresh = async () => {
    if (!currentAccountId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchEvents(currentAccountId);
      await fetchTaskLists(currentAccountId);
      const lists = useTasksStore.getState().taskLists;
      await Promise.all(lists.map((list) => fetchTasks(currentAccountId, list.id)));
    } finally {
      setIsRefreshing(false);
    }
  };

  const toLocalInputValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const openCreateDialog = (baseDate?: Date | null) => {
    const base = baseDate ? new Date(baseDate) : new Date(selectedDate);
    const start = new Date(base);
    start.setHours(9, 0, 0, 0);
    const end = new Date(base);
    end.setHours(10, 0, 0, 0);
    setCreateTitle("");
    setCreateLocation("");
    setCreateDescription("");
    setCreateAllDay(false);
    setCreateStart(toLocalInputValue(start));
    setCreateEnd(toLocalInputValue(end));
    setAiInput("");
    setAiError(null);
    setCreateDialogOpen(true);
  };

  const handleCreateStartChange = (value: string) => {
    setCreateStart(value);
    if (!value) return;
    const start = new Date(value);
    if (Number.isNaN(start.getTime())) return;
    const nextEnd = new Date(start.getTime() + 60 * 60000);
    setCreateEnd(toLocalInputValue(nextEnd));
  };

  const toLocalDateValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const openEditDialog = (event: CalendarItem) => {
    setEditEvent(event);
    setEditTitle(event.title || "");
    setEditLocation(event.location || "");
    setEditDescription(event.description || "");
    setEditAllDay(!!event.allDay);

    const startDate = new Date(event.start);
    const endDate = new Date(event.end);

    if (event.allDay) {
      // allDay 이벤트: 날짜만 표시, end는 exclusive이므로 하루 빼기
      setEditStart(toLocalDateValue(startDate));
      const adjustedEnd = addDays(endDate, -1);
      setEditEnd(toLocalDateValue(adjustedEnd));
    } else {
      setEditStart(toLocalInputValue(startDate));
      setEditEnd(toLocalInputValue(endDate));
    }
    setEditDialogOpen(true);
  };

  const openTaskEditDialog = (event: CalendarItem) => {
    const taskListId = event.taskListId;
    const taskId = event.taskId;
    const listTasks = taskListId ? tasks[taskListId] || [] : [];
    const source = taskId ? listTasks.find((task) => task.id === taskId) : undefined;

    setEditTaskItem(event);
    setEditTaskSource(source || null);
    setEditTaskTitle(source?.title || event.title || "");
    setEditTaskNotes(source?.notes || event.description || "");
    if (source?.due) {
      setEditTaskDue(toLocalInputValue(new Date(source.due)));
    } else {
      setEditTaskDue(event.start ? toLocalInputValue(new Date(event.start)) : "");
    }
    setEditTaskDialogOpen(true);
  };

  const normalizeLocalDateTime = (value: string, fallback: Date) => {
    if (!value) return toLocalInputValue(fallback);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      return value.slice(0, 16);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `${value}T09:00`;
    }
    return value;
  };

  const isDayView = viewType === "day";
  const rangeStart =
    viewType === "day"
      ? startOfDay(selectedDate)
      : viewType === "week"
      ? startOfWeek(selectedDate, { weekStartsOn: 0 })
      : startOfMonth(selectedDate);
  const rangeEnd =
    viewType === "day"
      ? endOfDay(selectedDate)
      : viewType === "week"
      ? endOfWeek(selectedDate, { weekStartsOn: 0 })
      : endOfMonth(selectedDate);

  const taskItems: CalendarItem[] = taskLists
    .flatMap((list) => tasks[list.id] || [])
    .filter((task) => task.due && !task.completed)
    .map((task) => {
      const due = new Date(task.due as Date);
      return {
        id: `task-${task.id}`,
        taskId: task.id,
        taskListId: task.taskListId,
        title: task.title,
        description: task.notes,
        start: due,
        end: due,
        allDay: true,
        kind: "task",
        completed: task.completed,
      };
    });

  const eventItems: CalendarItem[] = events.map((event) => ({
    ...event,
    kind: "event",
  }));

  const allItems = [
    ...(showEvents ? eventItems : []),
    ...(showTodos ? taskItems : []),
  ].filter((item) => {
    const start = new Date(item.start);
    const rawEnd = new Date(item.end);
    const end = item.allDay && rawEnd > start ? addDays(rawEnd, -1) : rawEnd;
    return start <= rangeEnd && end >= rangeStart;
  });

  allItems.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const headerLabel = (() => {
    if (viewType === "day") {
      return format(selectedDate, "M\uC6D4 d\uC77C(EEEE)", { locale: ko });
    }
    if (viewType === "week") {
      const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const end = addDays(start, 6);
      return `${format(start, "M\uC6D4 d\uC77C", { locale: ko })} ~ ${format(end, "M\uC6D4 d\uC77C", { locale: ko })}`;
    }
    const start = startOfMonth(selectedDate);
    return format(start, "yyyy\uB144 M\uC6D4", { locale: ko });
  })();

  const getEventRange = (event: CalendarItem) => {
    const startDate = new Date(event.start);
    const rawEnd = new Date(event.end);
    const endDate = event.allDay && rawEnd > startDate ? addDays(rawEnd, -1) : rawEnd;
    return { start: startOfDay(startDate), end: startOfDay(endDate) };
  };

  const isMultiDayEvent = (event: CalendarItem) => {
    const { start, end } = getEventRange(event);
    return differenceInCalendarDays(end, start) >= 1;
  };

  const multiDayEventIds = new Set(allItems.filter(isMultiDayEvent).map((event) => event.id));

  const eventsByDay = allItems.reduce<Record<string, CalendarItem[]>>((acc, event) => {
    const { start, end } = getEventRange(event);
    for (let day = start; day <= end; day = addDays(day, 1)) {
      const dayKey = format(day, "yyyy-MM-dd");
      if (!acc[dayKey]) acc[dayKey] = [];
      acc[dayKey].push(event);
    }
    return acc;
  }, {});

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const monthGridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const monthGridDays: Date[] = [];
  for (let day = monthGridStart; day <= monthGridEnd; day = addDays(day, 1)) {
    monthGridDays.push(day);
  }
  const monthWeeks: Date[][] = [];
  for (let i = 0; i < monthGridDays.length; i += 7) {
    monthWeeks.push(monthGridDays.slice(i, i + 7));
  }

  const selectedMonthDayEvents = selectedMonthDay
    ? eventsByDay[format(selectedMonthDay, "yyyy-MM-dd")] || []
    : [];

  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const processEventHtml = (html: string) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      doc.querySelectorAll("style, link[rel=\"stylesheet\"], script, base, meta").forEach((el) =>
        el.remove()
      );
      return doc.body?.innerHTML || "";
    } catch {
      return html;
    }
  };

  const hasHtml = (value?: string) => !!value && /<\/?[a-z][\s\S]*>/i.test(value);

  const formatDescriptionText = (text: string) => {
    // HTML 엔티티 디코딩 및 깔끔하게 정리
    return decodeHtmlEntities(text);
  };

  const handleCreateCalendarEvent = async () => {
    if (!currentAccountId) return;
    const title = createTitle.trim();
    if (!title) return;

    let start: Date;
    let end: Date;

    if (createAllDay) {
      // allDay: 날짜 문자열에서 로컬 시간대로 Date 생성
      if (createStart) {
        const [sy, sm, sd] = createStart.split('-').map(Number);
        start = new Date(sy, sm - 1, sd, 12, 0, 0);
      } else {
        start = new Date();
      }
      if (createEnd) {
        const [ey, em, ed] = createEnd.split('-').map(Number);
        end = new Date(ey, em - 1, ed, 12, 0, 0);
      } else {
        end = start;
      }
      if (end < start) {
        end = start;
      }
    } else {
      start = createStart ? new Date(createStart) : new Date();
      end = createEnd ? new Date(createEnd) : new Date(start.getTime() + 60 * 60000);
      if (end <= start) {
        end = new Date(start.getTime() + 60 * 60000);
      }
    }

    await createEvent(currentAccountId, {
      title,
      start,
      end,
      allDay: createAllDay,
      location: createLocation.trim() || undefined,
      description: createDescription.trim() || undefined,
    });
    setCreateDialogOpen(false);
  };

  const handleSaveEditEvent = async () => {
    if (!currentAccountId || !editEvent) return;
    const title = editTitle.trim();
    if (!title) return;

    let start: Date;
    let end: Date;

    if (editAllDay) {
      // allDay: 날짜 문자열에서 로컬 시간대로 Date 생성
      if (editStart) {
        const [sy, sm, sd] = editStart.split('-').map(Number);
        start = new Date(sy, sm - 1, sd, 12, 0, 0);
      } else {
        start = new Date(editEvent.start);
      }
      if (editEnd) {
        const [ey, em, ed] = editEnd.split('-').map(Number);
        end = new Date(ey, em - 1, ed, 12, 0, 0);
      } else {
        end = start;
      }
      if (end < start) {
        end = start;
      }
    } else {
      start = editStart ? new Date(editStart) : new Date(editEvent.start);
      end = editEnd ? new Date(editEnd) : new Date(start.getTime() + 60 * 60000);
      if (end <= start) {
        end = new Date(start.getTime() + 60 * 60000);
      }
    }

    const updatedEvent = {
      ...editEvent,
      title,
      start,
      end,
      allDay: editAllDay,
      location: editLocation.trim() || undefined,
      description: editDescription.trim() || undefined,
    };
    await saveEvent(currentAccountId, updatedEvent as any);
    setEditDialogOpen(false);
    setDetailEvent((prev) => (prev && prev.id === updatedEvent.id ? updatedEvent : prev));
    setEditEvent(updatedEvent);
  };

  const handleSaveEditTask = async () => {
    if (!currentAccountId || !editTaskItem) return;
    const title = editTaskTitle.trim();
    if (!title) return;
    const taskListId = editTaskSource?.taskListId || editTaskItem.taskListId;
    const taskId = editTaskSource?.id || editTaskItem.taskId;
    if (!taskListId || !taskId) return;

    const updatedTask: Task = {
      id: taskId,
      accountId: currentAccountId,
      taskListId,
      title,
      notes: editTaskNotes.trim() || undefined,
      due: editTaskDue ? new Date(editTaskDue) : undefined,
      completed: editTaskSource?.completed ?? editTaskItem.completed ?? false,
      completedDate: editTaskSource?.completedDate,
      position: editTaskSource?.position || "0",
      parent: editTaskSource?.parent,
      emailLink: editTaskSource?.emailLink,
    };

    await saveTask(currentAccountId, taskListId, updatedTask);

    const nextItem: CalendarItem = {
      ...editTaskItem,
      title: updatedTask.title,
      description: updatedTask.notes,
      start: updatedTask.due ? new Date(updatedTask.due) : editTaskItem.start,
      end: updatedTask.due ? new Date(updatedTask.due) : editTaskItem.end,
    };

    setEditTaskDialogOpen(false);
    setEditTaskItem(nextItem);
    setEditTaskSource(updatedTask);
    setDetailEvent((prev) => (prev && prev.id === editTaskItem.id ? nextItem : prev));
  };

  const buildWeekSegments = (weekStart: Date, weekEnd: Date) => {
    const segments = allItems
      .filter(isMultiDayEvent)
      .map((event) => {
        const { start, end } = getEventRange(event);
        if (end < weekStart || start > weekEnd) return null;
        const spanStart = start > weekStart ? start : weekStart;
        const spanEnd = end < weekEnd ? end : weekEnd;
        const startIdx = differenceInCalendarDays(spanStart, weekStart);
        const endIdx = differenceInCalendarDays(spanEnd, weekStart);
        return { event, startIdx, endIdx };
      })
      .filter(Boolean) as Array<{ event: CalendarItem; startIdx: number; endIdx: number }>;

    const lanes: boolean[][] = [];
    const placed: Array<{ event: CalendarItem; startIdx: number; endIdx: number; lane: number }> = [];
    segments.sort((a, b) => a.startIdx - b.startIdx || b.endIdx - b.startIdx);
    segments.forEach((segment) => {
      let laneIndex = 0;
      while (true) {
        if (!lanes[laneIndex]) {
          lanes[laneIndex] = Array(7).fill(false);
        }
        const occupied = lanes[laneIndex].slice(segment.startIdx, segment.endIdx + 1).some(Boolean);
        if (!occupied) {
          for (let i = segment.startIdx; i <= segment.endIdx; i += 1) {
            lanes[laneIndex][i] = true;
          }
          placed.push({ ...segment, lane: laneIndex });
          break;
        }
        laneIndex += 1;
      }
    });
    return placed;
  };

  const handleAiFill = async () => {
    if (!aiInput.trim() || !window.electronAPI?.aiParseSchedule) return;
    setAiLoading(true);
    setAiError(null);
    incrementPending();
    try {
      const baseDate = selectedMonthDay ?? selectedDate;
      const result = await window.electronAPI.aiParseSchedule({
        text: aiInput,
        baseDate: baseDate ? baseDate.toISOString() : undefined,
      });
      if (!result || !result.title) {
        setAiError("AI가 일정 정보를 충분히 추출하지 못했습니다.");
        return;
      }
      setCreateTitle(result.title || "");
      setCreateLocation(result.location || "");
      setCreateDescription((prev) => (prev.trim() ? prev : aiInput.trim()));
      setCreateAllDay(!!result.allDay);
      const fallbackBase = baseDate ?? new Date();
      if (result.startLocal) {
        setCreateStart(normalizeLocalDateTime(result.startLocal, fallbackBase));
      }
      if (result.endLocal) {
        setCreateEnd(normalizeLocalDateTime(result.endLocal, fallbackBase));
      }
    } catch {
      setAiError("AI 일정 추출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      decrementPending();
      addCompleted();
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant={viewType === "day" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewType("day")}
            >
              {LABEL_DAY}
            </Button>
            <Button
              variant={viewType === "week" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewType("week")}
            >
              {LABEL_WEEK}
            </Button>
            <Button
              variant={viewType === "month" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setViewType("month");
                setIsMonthOpen(true);
              }}
            >
              {LABEL_MONTH}
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleToday}>
              {LABEL_TODAY}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
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
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={showEvents} onCheckedChange={() => setShowEvents((v) => !v)} />
            <span>{LABEL_EVENT}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={showTodos} onCheckedChange={() => setShowTodos((v) => !v)} />
            <span>{LABEL_TASK}</span>
          </label>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-muted-foreground text-sm py-4">{LABEL_LOADING}</div>
          ) : allItems.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-4">{LABEL_EMPTY}</div>
          ) : (
            allItems.map((event) => (
              <EventItem key={event.id} event={event} showDate={!isDayView} />
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={isMonthOpen} onOpenChange={setIsMonthOpen}>
        <DialogContent className="calendar-month-dialog w-[90vw] max-w-[96rem]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4">
              <span>{format(selectedDate, "yyyy\uB144 M\uC6D4", { locale: ko })}</span>
              <span className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox checked={showEvents} onCheckedChange={() => setShowEvents((v) => !v)} />
                  <span>{LABEL_EVENT}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox checked={showTodos} onCheckedChange={() => setShowTodos((v) => !v)} />
                  <span>{LABEL_TASK}</span>
                </label>
                <span className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    title="새로고침"
                  >
                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSelectedDate(addMonths(selectedDate, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleToday}>
                    {LABEL_TODAY}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSelectedDate(addMonths(selectedDate, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="calendar-month-body grid grid-cols-[minmax(0,1fr)_280px] gap-4 p-1">
            <div className="calendar-month-left">
              <div className="grid grid-cols-7 text-xs text-muted-foreground mb-3">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="py-1 text-center">
                    {label}
                  </div>
                ))}
              </div>
              <div className="calendar-month-grid">
                {monthWeeks.map((weekDays, weekIndex) => {
                  const weekStart = startOfDay(weekDays[0]);
                  const weekEnd = startOfDay(weekDays[6]);
                  const weekSegments = buildWeekSegments(weekStart, weekEnd);
                  const weekBarSpace =
                    weekSegments.length > 0
                      ? Math.max(...weekSegments.map((segment) => segment.lane)) + 1
                      : 0;
                  const weekBarHeight = weekBarSpace > 0 ? weekBarSpace * 18 + (weekBarSpace - 1) * 4 : 0;
                  return (
                    <div
                      key={`week-${weekIndex}`}
                      className="calendar-week-row"
                      style={{ ['--calendar-bar-space' as any]: `${weekBarHeight}px` }}
                    >
                      <div className="calendar-week-grid grid grid-cols-7 gap-3">
                        {weekDays.map((day) => {
                          const dayKey = format(day, "yyyy-MM-dd");
                          const dayEvents = (eventsByDay[dayKey] || []).filter(
                            (event) => !multiDayEventIds.has(event.id)
                          );
                          const isCurrentMonth = isSameMonth(day, selectedDate);
                          const isToday = isSameDay(day, new Date());
                          const isSelected = selectedMonthDay ? isSameDay(day, selectedMonthDay) : false;
                          return (
                            <div
                              key={dayKey}
                              className={cn(
                                "calendar-day-cell rounded-md border text-xs cursor-pointer",
                                isCurrentMonth ? "bg-background" : "bg-muted/30 text-muted-foreground",
                                isToday && "border-primary/60",
                                isSelected && "ring-2 ring-primary/50"
                              )}
                              onClick={() => setSelectedMonthDay(day)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedMonthDay(day);
                                }
                              }}
                            >
                              <div
                                className={cn("calendar-day-label", isToday && "calendar-day-label-today")}
                              >
                                {format(day, "d")}
                              </div>
                              <div className="calendar-day-body space-y-1">
                                {dayEvents.map((event) => (
                                  <button
                                    key={event.id}
                                    type="button"
                                    onClick={() => setDetailEvent(event)}
                                    className={cn(
                                      "w-full text-left truncate rounded px-1.5 py-0.5",
                                      event.kind === "task"
                                        ? "bg-blue-500/10 hover:bg-blue-500/20"
                                        : "bg-primary/10 hover:bg-primary/20"
                                    )}
                                  >
                                    {event.kind === "task" ? `[${LABEL_TASK}] ${event.title}` : event.title}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {weekSegments.length > 0 && (
                        <div className="calendar-week-bars">
                          {weekSegments.map((segment) => (
                            <button
                              key={`${segment.event.id}-${segment.startIdx}-${segment.endIdx}`}
                              type="button"
                              className={cn(
                                "calendar-week-bar",
                                segment.event.kind === "task"
                                  ? "calendar-week-bar-task"
                                  : "calendar-week-bar-event"
                              )}
                              style={{
                                gridColumn: `${segment.startIdx + 1} / span ${segment.endIdx - segment.startIdx + 1}`,
                                gridRow: segment.lane + 1,
                              }}
                              onClick={() => setDetailEvent(segment.event)}
                            >
                              {segment.event.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-l pl-4">
              {selectedMonthDay ? (
                <>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium">
                      {format(selectedMonthDay, "M\uC6D4 d\uC77C(EEEE)", { locale: ko })}
                    </div>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openCreateDialog(selectedMonthDay)}
                    >
                      일정 추가
                    </Button>
                  </div>
                  {selectedMonthDayEvents.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{LABEL_EMPTY}</div>
                  ) : (
                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {selectedMonthDayEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setDetailEvent(event)}
                        className="w-full text-left rounded-md border px-3 py-2 hover:bg-muted/40"
                      >
                        <div className="font-medium text-sm">
                          {event.kind === "task" ? `[${LABEL_TASK}] ${event.title}` : event.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {event.allDay
                            ? LABEL_ALL_DAY
                            : `${formatTime(new Date(event.start))} - ${formatTime(
                                new Date(event.end)
                              )}`}
                          </div>
                          {event.location && (
                            <div className="text-xs text-muted-foreground mt-1">{event.location}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">{LABEL_EMPTY}</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>일정 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground">AI 일정 입력</label>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={handleAiFill}
                  disabled={aiLoading || !aiInput.trim()}
                >
                  {aiLoading ? "AI 분석 중..." : "AI로 채우기"}
                </Button>
              </div>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="예: 내일 오후 3시에 홍대 카페에서 팀 미팅"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
              />
              {aiError && <div className="text-[11px] text-destructive">{aiError}</div>}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">제목</label>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="일정 제목"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">장소</label>
              <Input
                value={createLocation}
                onChange={(e) => setCreateLocation(e.target.value)}
                placeholder="장소 (선택)"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">설명</label>
              <textarea
                className="w-full min-h-[70px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="설명 (선택)"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={createAllDay}
                onCheckedChange={(checked) => {
                  const newAllDay = checked === true;
                  setCreateAllDay(newAllDay);
                  if (newAllDay) {
                    if (createStart) setCreateStart(createStart.slice(0, 10));
                    if (createEnd) setCreateEnd(createEnd.slice(0, 10));
                  }
                }}
              />
              <span>{LABEL_ALL_DAY}</span>
            </label>
            {createAllDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{"\uC2DC\uC791\uC77C"}</label>
                  <Input
                    type="date"
                    value={createStart}
                    onChange={(e) => setCreateStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{"\uC885\uB8CC\uC77C"}</label>
                  <Input
                    type="date"
                    value={createEnd}
                    onChange={(e) => setCreateEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">시작</label>
                  <Input
                    type="datetime-local"
                    value={createStart}
                    onChange={(e) => handleCreateStartChange(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">종료</label>
                  <Input
                    type="datetime-local"
                    value={createEnd}
                    onChange={(e) => setCreateEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleCreateCalendarEvent} disabled={!createTitle.trim()}>
                일정 생성
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditEvent(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{LABEL_EDIT_EVENT}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{LABEL_TITLE}</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={PLACEHOLDER_TITLE}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{LABEL_LOCATION}</label>
              <Input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder={PLACEHOLDER_LOCATION}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{LABEL_DESCRIPTION}</label>
              <textarea
                className="w-full min-h-[70px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={PLACEHOLDER_DESCRIPTION}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={editAllDay}
                onCheckedChange={(checked) => {
                  const newAllDay = checked === true;
                  setEditAllDay(newAllDay);
                  // 하루종일 토글 시 날짜 형식 변환
                  if (newAllDay) {
                    if (editStart) setEditStart(editStart.slice(0, 10));
                    if (editEnd) setEditEnd(editEnd.slice(0, 10));
                  }
                }}
              />
              <span>{LABEL_ALL_DAY}</span>
            </label>
            {editAllDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{"\uC2DC\uC791\uC77C"}</label>
                  <Input
                    type="date"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{"\uC885\uB8CC\uC77C"}</label>
                  <Input
                    type="date"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{LABEL_START}</label>
                  <Input
                    type="datetime-local"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{LABEL_END}</label>
                  <Input
                    type="datetime-local"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditEvent(null);
                }}
              >
                {LABEL_CANCEL}
              </Button>
              <Button onClick={handleSaveEditEvent} disabled={!editTitle.trim()}>
                {LABEL_EDIT}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editTaskDialogOpen}
        onOpenChange={(open) => {
          setEditTaskDialogOpen(open);
          if (!open) {
            setEditTaskItem(null);
            setEditTaskSource(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{LABEL_TASK_EDIT}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{LABEL_TITLE}</label>
              <Input
                value={editTaskTitle}
                onChange={(e) => setEditTaskTitle(e.target.value)}
                placeholder={PLACEHOLDER_TITLE}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{LABEL_DESCRIPTION}</label>
              <textarea
                className="w-full min-h-[70px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={PLACEHOLDER_DESCRIPTION}
                value={editTaskNotes}
                onChange={(e) => setEditTaskNotes(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{LABEL_DUE}</label>
              <Input
                type="datetime-local"
                value={editTaskDue}
                onChange={(e) => setEditTaskDue(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditTaskDialogOpen(false);
                  setEditTaskItem(null);
                  setEditTaskSource(null);
                }}
              >
                {LABEL_CANCEL}
              </Button>
              <Button onClick={handleSaveEditTask} disabled={!editTaskTitle.trim()}>
                {LABEL_EDIT}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailEvent} onOpenChange={(open) => !open && setDetailEvent(null)}>
        <DialogContent className="max-w-xl" overlayClassName="bg-black/0">
          <DialogHeader>
            <DialogTitle>
              {detailEvent?.kind === "task" ? `[${LABEL_TASK}] ${detailEvent.title}` : detailEvent?.title}
            </DialogTitle>
          </DialogHeader>
          {detailEvent && (
            <div className="space-y-3 text-sm">
              <div className="text-muted-foreground text-xs">
                {detailEvent.allDay
                  ? LABEL_ALL_DAY
                  : `${formatTime(new Date(detailEvent.start))} - ${formatTime(
                      new Date(detailEvent.end)
                    )}`}
              </div>
              {detailEvent.description &&
                (hasHtml(detailEvent.description) ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none max-h-[300px] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: processEventHtml(detailEvent.description) }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap break-words text-sm max-h-[300px] overflow-y-auto leading-relaxed">
                    {formatDescriptionText(detailEvent.description)}
                  </div>
                ))}
              {detailEvent.location && (
                <div className="text-xs text-muted-foreground">{detailEvent.location}</div>
              )}
              {detailEvent.kind === "event" && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    onClick={() => openEditDialog(detailEvent)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    {LABEL_EDIT}
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    onClick={async () => {
                      if (!currentAccountId) return;
                      await deleteEvent(currentAccountId, detailEvent.id);
                      setDetailEvent(null);
                    }}
                    title="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {detailEvent.kind === "task" && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    onClick={() => openTaskEditDialog(detailEvent)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    {LABEL_EDIT}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventItem({ event, showDate }: { event: CalendarItem; showDate: boolean }) {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  return (
    <div
      className={cn(
        "p-2 rounded-md text-sm border-l-2",
        event.kind === "task"
          ? "bg-blue-500/10 border-blue-500"
          : "bg-primary/10 border-primary"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium truncate">
          {event.kind === "task" ? `[${LABEL_TASK}] ${event.title}` : event.title}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {showDate && <span className="mr-2">{format(eventStart, "M\uC6D4 d\uC77C(EEE)", { locale: ko })}</span>}
        {event.allDay ? LABEL_ALL_DAY : `${formatTime(eventStart)} - ${formatTime(eventEnd)}`}
      </div>
      {event.location && (
        <div className="text-xs text-muted-foreground truncate mt-0.5">{event.location}</div>
      )}
    </div>
  );
}
