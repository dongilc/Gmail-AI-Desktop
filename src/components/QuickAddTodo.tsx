import { useState, useEffect } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useTasksStore } from '@/stores/tasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SimpleCalendar } from '@/components/ui/simple-calendar';
import { getQuickDueDate, formatFullDate } from '@/lib/utils';

export function QuickAddTodo() {
  const { currentAccountId } = useAccountsStore();
  const {
    isQuickAddOpen,
    quickAddEmail,
    taskLists,
    selectedTaskListId,
    isLoading,
    closeQuickAdd,
    createTaskFromEmail,
    createTask,
    fetchTaskLists,
  } = useTasksStore();

  const [title, setTitle] = useState('');
  const [dueOption, setDueOption] = useState<'today' | 'tomorrow' | 'nextWeek' | 'custom' | 'none'>('today');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // 다이얼로그 열릴 때 할일 목록 불러오기
  useEffect(() => {
    if (isQuickAddOpen && currentAccountId && taskLists.length === 0) {
      fetchTaskLists(currentAccountId);
    }
  }, [isQuickAddOpen, currentAccountId, taskLists.length, fetchTaskLists]);

  useEffect(() => {
    if (!isQuickAddOpen) return;
    if (quickAddEmail && title.trim() === '') {
      setTitle(`[\uBA54\uC77C] ${quickAddEmail.subject}`);
    }
  }, [isQuickAddOpen, quickAddEmail]);

  // 커스텀 날짜 선택
  const handleCustomDateSelect = (date: Date) => {
    setCustomDate(date);
    setDueOption('custom');
    setIsCalendarOpen(false);
  };

  // 이메일이 있으면 자동 제목 설정

  const handleSubmit = async () => {
    if (!currentAccountId || !selectedTaskListId) return;

    let dueDate: Date | undefined;
    if (dueOption === 'custom' && customDate) {
      dueDate = customDate;
    } else if (dueOption !== 'none' && dueOption !== 'custom') {
      dueDate = getQuickDueDate(dueOption);
    }

    if (quickAddEmail) {
      await createTaskFromEmail(currentAccountId, selectedTaskListId, quickAddEmail, dueDate, title.trim() || `[\uBA54\uC77C] ${quickAddEmail.subject}`);
    } else if (title.trim()) {
      await createTask(currentAccountId, selectedTaskListId, {
        title: title.trim(),
        due: dueDate,
      });
      setTitle('');
      closeQuickAdd();
    }
  };

  const handleClose = () => {
    setTitle('');
    setDueOption('today');
    setCustomDate(undefined);
    closeQuickAdd();
  };

  return (
    <Dialog open={isQuickAddOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>{"\uD560 \uC77C \uCD94\uAC00"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email info if present */}
          {quickAddEmail && (
            <div className="bg-muted p-3 rounded-md text-sm">
              <div className="font-medium break-words">
                {quickAddEmail.subject}
              </div>
              <div className="text-muted-foreground text-xs mt-1">{"\uBCF4\uB0B8 \uC0AC\uB78C:"} {quickAddEmail.from.name || quickAddEmail.from.email}
              </div>
              <div className="text-muted-foreground text-xs mt-1 break-words">
                {quickAddEmail.snippet}
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">{"\uC81C\uBAA9"}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={quickAddEmail ? `[\uBA54\uC77C] ${quickAddEmail.subject}` : "\uD560 \uC77C\uC744 \uC785\uB825\uD558\uC138\uC694..."}
              className="mt-1"
              autoFocus
            />
          </div>

          {/* Due date quick options */}
          <div>
            <label className="text-sm font-medium flex items-center gap-2 mb-2">
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-muted transition-colors"
                    title="\uB0A0\uC9DC \uC120\uD0DD"
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <SimpleCalendar
                    selected={customDate}
                    onSelect={handleCustomDateSelect}
                  />
                </PopoverContent>
              </Popover>
              {"\uB9C8\uAC10\uC77C"}
              {dueOption === 'custom' && customDate && (
                <span className="text-xs text-muted-foreground ml-2">
                  ({formatFullDate(customDate)})
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {(['today', 'tomorrow', 'nextWeek', 'none'] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={dueOption === option ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setDueOption(option);
                    setCustomDate(undefined);
                  }}
                >
                  {option === 'today' && '\uC624\uB298'}
                  {option === 'tomorrow' && '\uB0B4\uC77C'}
                  {option === 'nextWeek' && '\uB2E4\uC74C \uC8FC'}
                  {option === 'none' && '\uC5C6\uC74C'}
                </Button>
              ))}
              {dueOption === 'custom' && customDate && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                >
                  {customDate.getMonth() + 1}/{customDate.getDate()}
                </Button>
              )}
            </div>
          </div>

          {/* Task list selection */}
          {taskLists.length > 1 && (
            <div>
              <label className="text-sm font-medium mb-2 block">{"\uBAA9\uB85D"}</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={selectedTaskListId || ''}
                onChange={(e) => useTasksStore.getState().setSelectedTaskList(e.target.value)}
              >
                {taskLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 할일 목록이 없는 경우 안내 */}
        {!isLoading && taskLists.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Google Tasks 목록이 없습니다. Google Tasks에서 먼저 목록을 만들어주세요.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {"\uCDE8\uC18C"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !selectedTaskListId || (!quickAddEmail && !title.trim())}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {"\uCD94\uAC00"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
