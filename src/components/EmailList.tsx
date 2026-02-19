import { useEffect, useRef, useCallback, useMemo, useState, forwardRef, startTransition, type HTMLAttributes } from 'react';
import { Star, AlertCircle, Paperclip, ListPlus, Loader2, RefreshCw, Mail, MailOpen, ArrowUp, Sparkles, CalendarPlus, ShieldAlert } from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useEmailsStore } from '@/stores/emails';
import { useTasksStore } from '@/stores/tasks';
import { useCalendarStore } from '@/stores/calendar';
import { usePreferencesStore } from '@/stores/preferences';
import { useAiStore } from '@/stores/ai';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatShortDate, formatTime, getSenderDisplayName, getSenderEmailAddress } from '@/lib/utils';
import type { Email, EmailAction, EmailActionType } from '@/types';

const SUMMARY_PLACEHOLDER = '\uC694\uC57D \uC900\uBE44 \uC911';
const ACTION_LABELS: Record<EmailActionType, string> = {
  submit: '\uC81C\uCD9C',
  meeting: '\uD68C\uC758',
  payment: '\uC785\uAE08',
  reservation: '\uC608\uC57D',
  review: '\uAC80\uD1A0',
  approval: '\uC2B9\uC778',
  survey: '\uC124\uBB38',
  other: '\uAE30\uD0C0',
};

const ACTION_KEYWORDS: Record<EmailActionType, string[]> = {
  submit: ['\uC81C\uCD9C', '\uB9C8\uAC10', '\uC811\uC218', '\uB0A9\uAE30', '\uC81C\uCD9C\uAE30\uD55C', 'submit', 'deadline'],
  meeting: ['\uD68C\uC758', '\uBBF8\uD305', '\uC138\uBBF8\uB098', '\uAC04\uB2F4\uD68C', '\uC90C', 'zoom', 'meeting'],
  payment: ['\uC785\uAE08', '\uACB0\uC81C', '\uC1A1\uAE08', '\uB0A9\uBD80', '\uCCAD\uAD6C', 'payment', 'invoice'],
  reservation: ['\uC608\uC57D', '\uC608\uC57D\uAE08', 'reservation', 'booking'],
  review: ['\uAC80\uD1A0', '\uB9AC\uBDF0', '\uD655\uC778', '\uAC80\uC218', 'review', 'feedback'],
  approval: ['\uC2B9\uC778', '\uACB0\uC7AC', '\uC5C5\uBB34\uC2B9\uC778', 'approve', 'approval'],
  survey: ['\uC124\uBB38', 'survey', 'questionnaire'],
  other: [],
};

const SUMMARY_VIEWS = ['inbox', 'unread', 'starred', 'important'] as const;

const SUMMARY_STOPWORDS = new Set([
  '그리고', '또한', '또는', '및', '등', '관련', '내용', '안내', '공지', '업데이트',
  '이메일', '메일', '요약', '주요', '내용을', '합니다', '되었습니다', '드립니다',
  '합니다', '되었습니다', '있습니다', '수', '것', '합니다', '됩니다', '입니다',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'to', 'of', 'in', 'on',
]);

const pickSummaryKeywords = (text: string, limit: number = 3): string[] => {
  const matches = text.match(/[가-힣A-Za-z0-9]{2,}/g) || [];
  const freq = new Map<string, number>();
  matches.forEach((token) => {
    const key = token.toLowerCase();
    if (SUMMARY_STOPWORDS.has(key)) return;
    freq.set(key, (freq.get(key) || 0) + 1);
  });
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([key]) => key);
};

const renderSummaryWithHighlights = (text: string, keywords: string[]) => {
  if (keywords.length === 0) return text;
  const keywordSet = new Set(keywords);
  const parts = text.split(/([가-힣A-Za-z0-9]{2,})/g);
  return parts.map((part, index) => {
    const key = part.toLowerCase();
    if (keywordSet.has(key)) {
      return (
        <strong key={`${part}-${index}`} className="ai-summary-keyword">
          {part}
        </strong>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
};


const extractActions = (text: string): EmailAction[] => {
  const normalized = text.toLowerCase();
  const actions: EmailAction[] = [];

  (Object.keys(ACTION_KEYWORDS) as EmailActionType[]).forEach((type) => {
    if (type === 'other') return;
    const matched = ACTION_KEYWORDS[type].some((keyword) => normalized.includes(keyword.toLowerCase()));
    if (matched) {
      actions.push({ type, label: ACTION_LABELS[type] });
    }
  });

  return actions;
};

export function EmailList() {
  const { currentAccountId } = useAccountsStore();
  const {
    emails,
    selectedEmail,
    currentView,
    isLoading,
    isSyncing,
        pageTokens,
    fetchEmails,
    fetchMoreEmails,
    fetchEmail,
    toggleStar,
    toggleImportant,
    markAsRead,
    markAsUnread,
    trashEmail,
    markAsSpam,
    updateEmail,
    scrollTargetEmailId,
    setScrollTargetEmailId,
  } = useEmailsStore();
  const { openQuickAdd } = useTasksStore();
  const { createEvent } = useCalendarStore();
  const { showEmailSummary, aiConcurrentTasks } = usePreferencesStore();
  const showSummaryForView = showEmailSummary && (SUMMARY_VIEWS as readonly string[]).includes(currentView);
  const isSentView = currentView === 'sent';
  const { enqueueTask, addTokens } = useAiStore();
  const maxConcurrent = aiConcurrentTasks || 1;

  const currentEmails = currentAccountId ? emails[currentAccountId] || [] : [];
  const hasMore = currentAccountId ? !!pageTokens[currentAccountId] : false;
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isLoadingMore = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState<{ email: Email; action: EmailAction } | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(new Set());
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const summaryTaskIdsRef = useRef<Map<string, string>>(new Map()); // emailId -> taskId
  const summaryUpdateQueueRef = useRef<Map<string, Email>>(new Map());
  const summaryUpdateTimerRef = useRef<number | null>(null);

  const flushSummaryUpdates = useCallback(() => {
    if (!currentAccountId) return;
    const updates = Array.from(summaryUpdateQueueRef.current.values());
    summaryUpdateQueueRef.current.clear();
    summaryUpdateTimerRef.current = null;
    updates.forEach((email) => {
      startTransition(() => {
        updateEmail(currentAccountId, email);
      });
    });
  }, [currentAccountId, updateEmail]);

  const scheduleSummaryUpdate = useCallback((email: Email) => {
    summaryUpdateQueueRef.current.set(email.id, email);
    if (summaryUpdateTimerRef.current !== null) return;
    summaryUpdateTimerRef.current = window.setTimeout(flushSummaryUpdates, 500);
  }, [flushSummaryUpdates]);

  // 날짜 범위 계산
  const dateRange = useMemo(() => {
    if (currentEmails.length === 0) return '';
    const dates = currentEmails.map(e => new Date(e.date).getTime());
    const oldest = new Date(Math.min(...dates));
    const newest = new Date(Math.max(...dates));
    const fmt = (d: Date) => d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
    return `${fmt(oldest)} ~ ${fmt(newest)}`;
  }, [currentEmails]);

  useEffect(() => {
    if (currentAccountId) {
      fetchEmails(currentAccountId, currentView);
    }
  }, [currentAccountId, currentView, fetchEmails]);

  useEffect(() => {
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
  }, [currentAccountId, currentView]);

  useEffect(() => {
    if (!scrollTargetEmailId) return;
    const targetIndex = currentEmails.findIndex((email) => email.id === scrollTargetEmailId);
    if (targetIndex === -1) return;
    virtuosoRef.current?.scrollToIndex({ index: targetIndex, align: 'center', behavior: 'smooth' });
    setSelectedIds(new Set([scrollTargetEmailId]));
    lastSelectedIdRef.current = scrollTargetEmailId;
    setScrollTargetEmailId(null);
  }, [currentEmails, scrollTargetEmailId, setScrollTargetEmailId]);

  // 무한 스크롤 - Intersection Observer
  const handleLoadMore = useCallback(async () => {
    if (!currentAccountId || !hasMore || isLoading || isLoadingMore.current) return;

    isLoadingMore.current = true;
    await fetchMoreEmails(currentAccountId);
    isLoadingMore.current = false;
  }, [currentAccountId, hasMore, isLoading, fetchMoreEmails]);

  // 새로고침 (캐시 무효화)
  const handleRefresh = async () => {
    if (!currentAccountId) return;
    setIsRefreshing(true);
    try {
      await window.electronAPI.refreshCache(currentAccountId);
      await fetchEmails(currentAccountId, currentView);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleScrollToTop = () => {
    virtuosoRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEmailClick = (email: Email, event?: React.MouseEvent) => {
    const isShift = !!event?.shiftKey;
    const isToggle = !!(event?.metaKey || event?.ctrlKey);

    if (isShift && lastSelectedIdRef.current) {
      const startIndex = currentEmails.findIndex((e) => e.id === lastSelectedIdRef.current);
      const endIndex = currentEmails.findIndex((e) => e.id === email.id);
      if (startIndex !== -1 && endIndex !== -1) {
        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const rangeIds = currentEmails.slice(from, to + 1).map((e) => e.id);
        setSelectedIds(new Set(rangeIds));
        lastSelectedIdRef.current = email.id;
        return;
      }
    }

    if (isToggle) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(email.id)) {
          next.delete(email.id);
        } else {
          next.add(email.id);
        }
        return next;
      });
      lastSelectedIdRef.current = email.id;
      return;
    }

    setSelectedIds(new Set([email.id]));
    lastSelectedIdRef.current = email.id;

    // ???????????????? ????? ???????? ??? ???
    // ?? ????????????? ??????????? ???
    if (currentAccountId && selectedEmail && !selectedEmail.isRead && selectedEmail.id !== email.id) {
      const manuallyMarkedUnread = useEmailsStore.getState().manuallyMarkedUnread;
      if (!manuallyMarkedUnread.has(selectedEmail.id)) {
        useEmailsStore.getState().markAsRead(currentAccountId, selectedEmail.id);
      }
    }

    // ??????????? ?????????? ????????????? (??? ??? ???)
    const manuallyMarkedUnread = useEmailsStore.getState().manuallyMarkedUnread;
    if (manuallyMarkedUnread.has(email.id)) {
      const newSet = new Set(manuallyMarkedUnread);
      newSet.delete(email.id);
      useEmailsStore.setState({ manuallyMarkedUnread: newSet });
    }

    // ??????????
    useEmailsStore.getState().setSelectedEmail(email);

    // ??? ??? ??????????? (본문/첨부 누락 시만)
    if (currentAccountId) {
      const needsFetch =
        (!email.body && !email.bodyHtml) || email.attachments === undefined;
      if (needsFetch) {
        fetchEmail(currentAccountId, email.id);
      }
    }
  };



  const handleContextSelect = (email: Email) => {
    if (!selectedIds.has(email.id)) {
      setSelectedIds(new Set([email.id]));
      lastSelectedIdRef.current = email.id;
    }
  };

  const handleBulkMarkRead = async () => {
    if (!currentAccountId || selectedIds.size == 0) return;
    await Promise.all(Array.from(selectedIds).map((id) => markAsRead(currentAccountId, id)));
  };

  const handleBulkMarkUnread = async () => {
    if (!currentAccountId || selectedIds.size == 0) return;
    await Promise.all(Array.from(selectedIds).map((id) => markAsUnread(currentAccountId, id)));
  };
  const handleBulkTrash = async () => {
    if (!currentAccountId || selectedIds.size == 0) return;
    await Promise.all(Array.from(selectedIds).map((id) => trashEmail(currentAccountId, id)));
  };

  const handleBulkMarkSpam = async () => {
    if (!currentAccountId || selectedIds.size == 0) return;
    await Promise.all(Array.from(selectedIds).map((id) => markAsSpam(currentAccountId, id)));
  };

  const executeSummaryTask = useCallback((email: Email) => {
    if (!currentAccountId) return;

    startTransition(() => {
      setSummarizingIds((prev) => new Set(prev).add(email.id));
    });

    const taskId = enqueueTask(async () => {
      try {
        const summary = await window.electronAPI.summarizeEmail(currentAccountId, email.id);
        if (summary?.summaryLines?.length) {
          scheduleSummaryUpdate({ ...email, summary });
        }
        addTokens(summary?.promptTokens || 0, summary?.evalTokens || 0);
      } catch (error) {
        console.error('Failed to generate summary:', error);
      } finally {
        startTransition(() => {
          setSummarizingIds((prev) => {
            const updated = new Set(prev);
            updated.delete(email.id);
            return updated;
          });
        });
        summaryTaskIdsRef.current.delete(email.id);
      }
    }, maxConcurrent);

    summaryTaskIdsRef.current.set(email.id, taskId);
  }, [currentAccountId, enqueueTask, maxConcurrent, scheduleSummaryUpdate, addTokens]);

  const enqueueSummary = useCallback((email: Email) => {
    if (!currentAccountId) return;
    if (summarizingIds.has(email.id)) return;
    if (summaryTaskIdsRef.current.has(email.id)) return;
    executeSummaryTask(email);
  }, [currentAccountId, summarizingIds, executeSummaryTask]);

  const VirtuosoScroller = useMemo(
    () =>
      forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>((props, ref) => (
        <div
          {...props}
          ref={ref}
          className={cn('flex-1 overflow-auto', props.className)}
        />
      )),
    []
  );

  const VirtuosoList = useMemo(
    () =>
      forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>((props, ref) => (
        <div {...props} ref={ref} className={cn('divide-y', props.className)} />
      )),
    []
  );

  const handleBulkGenerateSummary = async () => {
    if (!currentAccountId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    ids.forEach((id) => {
      const email = currentEmails.find((e) => e.id === id);
      if (email) enqueueSummary(email);
    });
  };
  const handleToggleStar = (e: React.MouseEvent, email: Email) => {
    e.stopPropagation();
    if (currentAccountId) {
      toggleStar(currentAccountId, email.id);
    }
  };

  const handleAddTodo = (email: Email) => {
    openQuickAdd(email);
  };

  const handleGenerateSummary = async (email: Email) => {
    if (!currentAccountId) return;
    enqueueSummary(email);
  };

  const toggleSummaryExpanded = useCallback((emailId: string) => {
    setExpandedSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  }, []);

  const toLocalInputValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const toLocalDateValue = (date: Date) => {
    return date.toISOString().slice(0, 10);
  };

  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const htmlToPlainText = (html: string) => {
    // HTML을 텍스트로 변환 (줄바꿈 유지)
    const div = document.createElement('div');
    div.innerHTML = html;
    // <br>, <p>, <div> 태그를 줄바꿈으로 변환
    div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    div.querySelectorAll('p, div').forEach(el => {
      el.prepend(document.createTextNode('\n'));
      el.append(document.createTextNode('\n'));
    });
    const text = div.textContent || div.innerText || '';
    // 연속 줄바꿈 정리 및 HTML 엔티티 디코딩
    return decodeHtmlEntities(text.replace(/\n{3,}/g, '\n\n').trim());
  };

  const handleAddEvent = (email: Email, action: EmailAction) => {
    setEventDraft({ email, action });
    setEventDialogOpen(true);
    setEventLoading(false);
    setEventAllDay(false);

    // 메일 날짜 기반으로 시작/종료 설정
    const emailDate = email.date ? new Date(email.date) : new Date();
    const startDate = action.dueDate ? new Date(action.dueDate) : emailDate;
    const endDate = new Date(startDate.getTime() + 60 * 60000); // 1시간 후

    setEventTitle(decodeHtmlEntities(email.subject || '(제목 없음)'));
    setEventStart(toLocalInputValue(startDate));
    setEventEnd(toLocalInputValue(endDate));
    setEventLocation('');

    // 설명에 메일 내용 넣기 (HTML을 텍스트로 변환, 줄바꿈 유지)
    let emailContent = '';
    if (email.body) {
      emailContent = htmlToPlainText(email.body);
    } else if (email.snippet) {
      emailContent = decodeHtmlEntities(email.snippet);
    }
    const description = [
      `보낸사람: ${getSenderDisplayName(email.from.name, email.from.email)}`,
      `날짜: ${emailDate.toLocaleString('ko-KR')}`,
      '',
      emailContent,
    ].join('\n');
    setEventDescription(description);
  };

  const handleAddEventWithAI = async (email: Email, action: EmailAction) => {
    setEventDraft({ email, action });
    setEventDialogOpen(true);
    setEventLoading(true);
    setEventAllDay(false);
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
    setEventLocation('');
    setEventDescription('');

    // 메일 내용 추출
    const emailDate = email.date ? new Date(email.date) : new Date();
    let emailContent = '';
    if (email.body) {
      emailContent = htmlToPlainText(email.body);
    } else if (email.snippet) {
      emailContent = decodeHtmlEntities(email.snippet);
    }

    const fullText = `제목: ${email.subject || ''}\n날짜: ${emailDate.toLocaleString('ko-KR')}\n내용:\n${emailContent}`;

    try {
      if (window.electronAPI?.aiParseSchedule) {
        const result = await window.electronAPI.aiParseSchedule({
          text: fullText,
          baseDate: emailDate.toISOString(),
        });

        if (result) {
          setEventTitle(result.title || decodeHtmlEntities(email.subject || '(제목 없음)'));
          setEventLocation(result.location || '');
          setEventAllDay(result.allDay || false);

          if (result.allDay) {
            setEventStart(result.startLocal?.slice(0, 10) || toLocalDateValue(emailDate));
            setEventEnd(result.endLocal?.slice(0, 10) || toLocalDateValue(emailDate));
          } else {
            setEventStart(result.startLocal || toLocalInputValue(emailDate));
            const defaultEnd = new Date(emailDate.getTime() + 60 * 60000);
            setEventEnd(result.endLocal || toLocalInputValue(defaultEnd));
          }

          // 설명 설정
          const description = [
            `보낸사람: ${getSenderDisplayName(email.from.name, email.from.email)}`,
            `날짜: ${emailDate.toLocaleString('ko-KR')}`,
            '',
            emailContent,
          ].join('\n');
          setEventDescription(description);
        } else {
          // AI 실패 시 기본값 설정
          handleAddEvent(email, action);
        }
      } else {
        // AI 사용 불가 시 기본값
        handleAddEvent(email, action);
      }
    } catch (error) {
      console.error('AI 일정 분석 실패:', error);
      // 에러 시 기본값 설정
      handleAddEvent(email, action);
    } finally {
      setEventLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!currentAccountId || !eventDraft) return;

    let start: Date;
    let end: Date;

    if (eventAllDay) {
      // 하루종일 이벤트: 로컬 시간대로 Date 생성 (UTC 변환 문제 방지)
      if (eventStart) {
        const [sy, sm, sd] = eventStart.split('-').map(Number);
        start = new Date(sy, sm - 1, sd, 12, 0, 0); // 정오로 설정하여 시간대 문제 최소화
      } else {
        start = new Date();
      }
      if (eventEnd) {
        const [ey, em, ed] = eventEnd.split('-').map(Number);
        end = new Date(ey, em - 1, ed, 12, 0, 0);
      } else {
        end = new Date(start.getTime() + 24 * 60 * 60000);
      }
      if (end <= start) {
        end = new Date(start.getTime() + 24 * 60 * 60000);
      }
    } else {
      start = eventStart ? new Date(eventStart) : new Date();
      end = eventEnd ? new Date(eventEnd) : new Date(start.getTime() + 60 * 60000);
      if (end <= start) {
        end = new Date(start.getTime() + 60 * 60000);
      }
    }

    await createEvent(currentAccountId, {
      title: eventTitle.trim() || eventDraft.action.label,
      start,
      end,
      allDay: eventAllDay,
      description: eventDescription,
      location: eventLocation.trim() || undefined,
    });

    setEventDialogOpen(false);
    setEventDraft(null);
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
    setEventAllDay(false);
    setEventDescription('');
    setEventLocation('');
  };

  const renderEmailItem = useCallback(
    (index: number) => {
      const email = currentEmails[index];
      if (!email) return null;
      const isMultiSelected = selectedIds.has(email.id);
      const isMultiMode = selectedIds.size > 1;
      const summaryLines = email.summary?.summaryLines?.filter(Boolean) || [];
      const summaryText = summaryLines.length > 0
        ? summaryLines.join(' ')
        : (email.snippet || '');
      const summaryKeywords = summaryLines.length > 0 ? pickSummaryKeywords(summaryText) : [];
      const actions = email.summary?.actions?.length
        ? email.summary.actions
        : extractActions(`${email.subject || ''} ${email.snippet || ''}`.trim());
      const isSummarizing = summarizingIds.has(email.id);
      const isSummaryExpanded = expandedSummaries.has(email.id);
      const showSummaryToggle =
        summaryLines.length > 0 && summaryText.trim().length > 120 && !isSummarizing;
      const recipientLabel = isSentView
        ? (() => {
            const recipients = email.to || [];
            if (recipients.length === 0) return '(받는 사람 없음)';
            const primary = recipients[0];
            const primaryEmail = getSenderEmailAddress(primary?.email || primary?.name);
            const primaryLabel =
              primaryEmail || getSenderDisplayName(primary?.name, primary?.email) || '(받는 사람 없음)';
            return recipients.length > 1 ? `${primaryLabel} 외 ${recipients.length - 1}명` : primaryLabel;
          })()
        : '';
      return (
        <ContextMenu key={email.id}>
          <ContextMenuTrigger>
            <div
              data-email-id={email.id}
              onClick={(e) => handleEmailClick(email, e)}
              onContextMenu={() => handleContextSelect(email)}
              className={cn(
                'flex flex-col p-3 cursor-pointer transition-colors border-l-4',
                isMultiSelected
                  ? 'bg-muted border-l-primary'
                  : 'hover:bg-muted/50 border-l-transparent',
                !email.isRead && 'bg-blue-50 dark:bg-blue-950/30 border-l-blue-500'
              )}
            >
              <div className="flex items-center gap-2 mb-1 min-w-0">
                {!email.isRead ? (
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                ) : (
                  <div className="w-2 shrink-0" />
                )}

                <button
                  onClick={(e) => handleToggleStar(e, email)}
                  className={cn(
                    'shrink-0 transition-colors',
                    email.isStarred ? 'text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'
                  )}
                >
                  <Star className={cn('h-4 w-4', email.isStarred && 'fill-current')} />
                </button>

                <span className={cn(
                  'text-sm font-medium',
                  !email.isRead ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {formatShortDate(new Date(email.date))}
                </span>
                <span className={cn(
                  'text-sm',
                  !email.isRead ? 'text-blue-500 font-medium' : 'text-blue-400'
                )}>
                  {formatTime(new Date(email.date))}
                </span>
              </div>

              <div className="pl-6 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm whitespace-normal break-words font-semibold min-w-0',
                      !email.isRead ? 'text-foreground' : 'text-foreground/80'
                    )}
                  >
                    {isSentView ? (
                      <>
                        <strong className="font-semibold">{'받는 사람:'}</strong> {recipientLabel}
                      </>
                    ) : (
                      getSenderDisplayName(email.from.name, email.from.email)
                    )}
                  </span>
                  {email.isImportant && (
                    <AlertCircle className="h-3 w-3 text-yellow-600 shrink-0" />
                  )}
                  {email.attachments && email.attachments.length > 0 && (
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </div>
                {isSentView && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {`보낸 사람: ${getSenderEmailAddress(email.from.email) || '-'}`}
                  </div>
                )}
                <div className="min-w-0">
                  <p className={cn(
                    'text-sm whitespace-normal break-words email-list-text',
                    !email.isRead ? 'font-semibold text-foreground' : 'text-foreground'
                  )}>
                    {email.subject || '(?쒕ぉ ?놁쓬)'}
                  </p>
                  {showSummaryForView && (
                    <>
                      <p
                        className={cn(
                          'email-summary email-list-text text-xs text-muted-foreground mt-1',
                          isSummaryExpanded && 'email-summary-expanded'
                        )}
                      >
                        {isSummarizing ? (
                          <>
                            <span className="ai-summary-label">{'AI\uC694\uC57D'}</span>
                            <span className="ai-summary-loading">
                              {'\uC694\uC57D \uC0DD\uC131\uC911...'}
                              <span className="ai-summary-dots" aria-hidden="true">
                                <span>.</span>
                                <span>.</span>
                                <span>.</span>
                              </span>
                            </span>
                          </>
                        ) : (
                          <>
                            {summaryLines.length > 0 && (
                              <span className="ai-summary-label">{'AI\uC694\uC57D'}</span>
                            )}
                            {summaryText.trim().length > 0
                              ? renderSummaryWithHighlights(summaryText, summaryKeywords)
                              : SUMMARY_PLACEHOLDER}
                          </>
                        )}
                      </p>
                      {showSummaryToggle && (
                        <button
                          type="button"
                          className="ai-summary-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSummaryExpanded(email.id);
                          }}
                        >
                          {isSummaryExpanded ? '\uC811\uAE30' : '\uB354\uBCF4\uAE30'}
                        </button>
                      )}
                      {actions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-2">
                          {actions.map((action, actionIndex) => (
                            <ActionChip
                              key={`${email.id}-${action.type}-${actionIndex}`}
                              action={action}
                              onAddTask={() => handleAddTodo(email)}
                              onAddEvent={() => handleAddEvent(email, action)}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {isMultiMode ? (
              <>
                <ContextMenuItem onClick={handleBulkGenerateSummary} disabled={summarizingIds.size > 0}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {summarizingIds.size > 0
                    ? `AI\uC694\uC57D \uC0DD\uC131 \uC911...`
                    : `\uC120\uD0DD ${selectedIds.size}\uAC1C AI\uC694\uC57D \uC0DD\uC131`}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleBulkMarkRead}>
                  <MailOpen className="mr-2 h-4 w-4" />
                  {`\uC120\uD0DD ${selectedIds.size}\uAC1C \uC77D\uC74C\uC73C\uB85C \uC801\uC6A9`}
                </ContextMenuItem>
                <ContextMenuItem onClick={handleBulkMarkUnread}>
                  <Mail className="mr-2 h-4 w-4" />
                  {`\uC120\uD0DD ${selectedIds.size}\uAC1C \uC548\uC77D\uC74C\uC73C\uB85C \uC801\uC6A9`}
                </ContextMenuItem>
                <ContextMenuItem onClick={handleBulkMarkSpam} className="text-destructive focus:text-destructive">
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {currentView === 'spam'
                    ? `선택 ${selectedIds.size}개 스팸 해제`
                    : `선택 ${selectedIds.size}개 스팸 처리`}
                </ContextMenuItem>
                <ContextMenuItem onClick={handleBulkTrash} className="text-destructive focus:text-destructive">
                  <Mail className="mr-2 h-4 w-4" />
                  {`\uC120\uD0DD ${selectedIds.size}\uAC1C \uD734\uC9C0\uD1B5`}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            ) : null}
            {!isMultiMode && (
              <>
                <ContextMenuItem
                  onClick={() => handleGenerateSummary(email)}
                  disabled={summarizingIds.has(email.id)}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {summarizingIds.has(email.id)
                    ? 'AI\uC694\uC57D \uC0DD\uC131 \uC911...'
                    : 'AI\uC694\uC57D \uC0DD\uC131'}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleAddEvent(email, { type: 'other', label: '일정' })}>
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  {"\uCE98\uB9B0\uB354\uC5D0 \uCD94\uAC00"}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAddEventWithAI(email, { type: 'other', label: '일정' })}>
                  <Sparkles className="mr-2 h-4 w-4 text-purple-400" />
                  {"AI \uCE98\uB9B0\uB354 \uCD94\uAC00"}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAddTodo(email)}>
                  <ListPlus className="mr-2 h-4 w-4" />
                  {"\uD560 \uC77C \uCD94\uAC00"}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => currentAccountId && toggleStar(currentAccountId, email.id)}
                >
                  <Star className="mr-2 h-4 w-4" />
                  {email.isStarred ? '\uBCC4\uD45C \uD574\uC81C' : '\uBCC4\uD45C \uCD94\uAC00'}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => currentAccountId && toggleImportant(currentAccountId, email.id)}
                >
                  <AlertCircle className="mr-2 h-4 w-4" />
                  {email.isImportant ? '\uC911\uC694 \uD574\uC81C' : '\uC911\uC694 \uD45C\uC2DC'}
                </ContextMenuItem>
              </>
            )}
            {!isMultiMode && (
              <ContextMenuItem
                onClick={() => {
                  if (currentAccountId) {
                    if (email.isRead) {
                      markAsUnread(currentAccountId, email.id);
                    } else {
                      markAsRead(currentAccountId, email.id);
                    }
                  }
                }}
              >
                {email.isRead ? (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    {"\uC548\uC77D\uC74C\uC73C\uB85C \uD45C\uC2DC"}
                  </>
                ) : (
                  <>
                    <MailOpen className="mr-2 h-4 w-4" />
                    {"\uC77D\uC74C\uC73C\uB85C \uD45C\uC2DC"}
                  </>
                )}
              </ContextMenuItem>
            )}
            {!isMultiMode && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => currentAccountId && markAsSpam(currentAccountId, email.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {currentView === 'spam' ? '스팸 해제' : '스팸 처리'}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => currentAccountId && trashEmail(currentAccountId, email.id)}
                  className="text-destructive focus:text-destructive"
                >
                  {"\uD734\uC9C0\uD1B5"}
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      );
    },
    [
      currentAccountId,
      currentEmails,
      handleAddEvent,
      handleAddEventWithAI,
      handleAddTodo,
      handleBulkGenerateSummary,
      handleBulkMarkRead,
      handleBulkMarkUnread,
      handleBulkTrash,
      handleContextSelect,
      handleEmailClick,
      handleGenerateSummary,
      handleToggleStar,
      markAsRead,
      markAsSpam,
      markAsUnread,
      renderSummaryWithHighlights,
      selectedIds,
      showEmailSummary,
      summarizingIds,
      toggleImportant,
      toggleStar,
      trashEmail,
    ]
  );

  if (isLoading && currentEmails.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <span className="text-xs text-muted-foreground">로딩 중...</span>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (currentEmails.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <span className="text-xs text-muted-foreground">0개의 메일</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleRefresh}
            title="새로고침"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          메일이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더: 새로고침 버튼 */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-xs text-muted-foreground">
          {currentEmails.length}개의 메일{dateRange && ` (${dateRange})`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleScrollToTop}
            title="맨위로"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleRefresh}
            disabled={isRefreshing || isSyncing}
            title="새로고침"
          >
            <RefreshCw className={cn('h-4 w-4', (isRefreshing || isSyncing) && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <Virtuoso
        ref={virtuosoRef}
        className="flex-1"
        totalCount={currentEmails.length}
        endReached={handleLoadMore}
        overscan={300}
        components={{
          Scroller: VirtuosoScroller,
          List: VirtuosoList,
          Footer: () =>
            hasMore ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  '?ㅼ쓬 ?대찓?쇱쓣 遺덈윭?ㅼ쓬...'
                )}
              </div>
            ) : null,
        }}
        itemContent={renderEmailItem}
      />

      <Dialog
        open={eventDialogOpen}
        onOpenChange={(open) => {
          setEventDialogOpen(open);
          if (!open) {
            setEventDraft(null);
            setEventAllDay(false);
            setEventDescription('');
            setEventLocation('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {'\uC77C\uC815 \uCD94\uAC00'}
              {eventLoading && (
                <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {'AI \uBD84\uC11D \uC911...'}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{'\uC81C\uBAA9'}</label>
              <Input
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder={'\uC77C\uC815 \uC81C\uBAA9'}
                disabled={eventLoading}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="event-all-day"
                checked={eventAllDay}
                onCheckedChange={(checked) => {
                  setEventAllDay(checked === true);
                  // 하루종일 토글 시 날짜 형식 변환
                  if (checked && eventStart) {
                    setEventStart(eventStart.slice(0, 10));
                  }
                  if (checked && eventEnd) {
                    setEventEnd(eventEnd.slice(0, 10));
                  }
                }}
                disabled={eventLoading}
              />
              <label htmlFor="event-all-day" className="text-xs cursor-pointer">
                {'\uD558\uB8E8\uC885\uC77C'}
              </label>
            </div>
            {eventAllDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{'\uC2DC\uC791\uC77C'}</label>
                  <Input
                    type="date"
                    value={eventStart}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setEventStart(newStart);
                      // 종료일이 시작일보다 작으면 시작일로 설정
                      if (eventEnd && newStart > eventEnd) {
                        setEventEnd(newStart);
                      }
                    }}
                    disabled={eventLoading}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{'\uC885\uB8CC\uC77C'}</label>
                  <Input
                    type="date"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                    min={eventStart}
                    disabled={eventLoading}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{'\uC2DC\uC791'}</label>
                  <Input
                    type="datetime-local"
                    value={eventStart}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setEventStart(newStart);
                      // 종료가 시작보다 작으면 시작 + 1시간으로 설정
                      if (eventEnd && newStart >= eventEnd) {
                        const startDate = new Date(newStart);
                        const newEnd = new Date(startDate.getTime() + 60 * 60000);
                        const offset = newEnd.getTimezoneOffset() * 60000;
                        setEventEnd(new Date(newEnd.getTime() - offset).toISOString().slice(0, 16));
                      }
                    }}
                    disabled={eventLoading}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{'\uC885\uB8CC'}</label>
                  <Input
                    type="datetime-local"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                    min={eventStart}
                    disabled={eventLoading}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{'\uC7A5\uC18C'}</label>
              <Input
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                placeholder={'\uC7A5\uC18C (\uC120\uD0DD)'}
                disabled={eventLoading}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{'\uC124\uBA85'}</label>
              <textarea
                className="w-full min-h-[160px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                placeholder={'\uC77C\uC815 \uC124\uBA85'}
                disabled={eventLoading}
              />
            </div>
            {eventDraft && (
              <div className="text-xs text-muted-foreground">
                {getSenderDisplayName(eventDraft.email.from.name, eventDraft.email.from.email)}
                {' — '}
                {eventDraft.email.subject}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEventDialogOpen(false)}>
                {'\uCDE8\uC18C'}
              </Button>
              <Button onClick={handleCreateEvent} disabled={eventLoading}>
                {'\uC77C\uC815 \uC0DD\uC131'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ACTION_COLOR: Record<EmailActionType, string> = {
  submit: 'text-amber-400',
  meeting: 'text-blue-400',
  payment: 'text-emerald-400',
  reservation: 'text-violet-400',
  review: 'text-cyan-400',
  approval: 'text-rose-400',
  survey: 'text-orange-400',
  other: 'text-muted-foreground',
};

function ActionChip({
  action,
  onAddTask,
  onAddEvent,
}: {
  action: EmailAction;
  onAddTask: () => void;
  onAddEvent: () => void;
}) {
  const dueLabel = action.dueDate
    ? `${formatShortDate(new Date(action.dueDate))} ${formatTime(new Date(action.dueDate))}`
    : '';
  return (
    <div className="flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] bg-muted/50 border border-white/5">
      <span className={cn('font-medium', ACTION_COLOR[action.type] || 'text-muted-foreground')}>
        {action.label || ACTION_LABELS[action.type]}
      </span>
      {dueLabel ? (
        <span className="text-[10px] text-muted-foreground">{dueLabel}</span>
      ) : null}
      <button
        className="text-[10px] text-blue-400 hover:text-blue-300"
        onClick={(e) => {
          e.stopPropagation();
          onAddTask();
        }}
      >
        {'\uD560 \uC77C'}
      </button>
      <button
        className="text-[10px] text-emerald-400 hover:text-emerald-300"
        onClick={(e) => {
          e.stopPropagation();
          onAddEvent();
        }}
        title={'\uC77C\uC815 \uCD94\uAC00'}
      >
        {'\uC77C\uC815'}
      </button>
    </div>
  );
}
