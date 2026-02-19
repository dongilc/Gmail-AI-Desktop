import { useEffect, useMemo, useState, useRef } from 'react';
import { RefreshCw, SendHorizonal, Sparkles } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAccountsStore } from '@/stores/accounts';
import { useAiStore } from '@/stores/ai';
import { useCalendarStore } from '@/stores/calendar';
import { useTasksStore } from '@/stores/tasks';
import { usePreferencesStore } from '@/stores/preferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatTime } from '@/lib/utils';
import type { Task, CalendarEvent } from '@/types';

type TabKey = 'briefing' | 'chat' | 'translate';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type BriefingEntry = { kind: 'text' | 'bullet'; text: string };
type BriefingSection = { title: string; entries: BriefingEntry[] };

const isEmptyBriefingValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lowered = trimmed.toLowerCase();
  return lowered === '없음' || lowered === 'none';
};

const parseBulletEntries = (text: string): BriefingEntry[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-+*•]\s+/, '').trim())
    .filter(Boolean);
  return lines.map((line) => ({ kind: 'bullet', text: line }));
};

const isNewsSectionTitle = (title: string) => {
  const normalized = title.replace(/\s+/g, '').toLowerCase();
  return normalized.includes('국제이슈') || normalized.includes('worldnews') || normalized.includes('world');
};

const parseBriefingText = (text: string): BriefingSection[] => {
  if (!text?.trim()) return [];
  const lines = text.split(/\r?\n/);
  const sections: BriefingSection[] = [];
  let current: BriefingSection | null = null;
  const pushSection = (title: string) => {
    current = { title, entries: [] };
    sections.push(current);
  };
  const ensureSection = () => {
    if (!current) {
      pushSection('브리핑');
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const headerMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (headerMatch) {
      pushSection(headerMatch[1].trim());
      continue;
    }
    const bulletMatch = line.match(/^[-+*•]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch) {
      ensureSection();
      current!.entries.push({ kind: 'bullet', text: bulletMatch[1].trim() });
      continue;
    }
    ensureSection();
    current!.entries.push({ kind: 'text', text: line });
  }
  return sections;
};

const renderBoldInline = (text: string) => {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? <strong key={`b-${index}`}>{part}</strong> : <span key={`t-${index}`}>{part}</span>
  );
};

const buildChatPrompt = (messages: ChatMessage[]) => {
  const history = messages
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
  return [
    'You are a helpful AI assistant for a personal email and calendar app.',
    'Answer in Korean unless the user asks for another language.',
    history,
    'Assistant:',
  ].join('\n');
};

const buildBriefingPrompt = (payload: {
  dateLabel: string;
  tasksText: string;
  eventsText: string;
  weatherText: string;
  newsText: string;
  language: 'ko' | 'en';
}) => {
  const isKo = payload.language === 'ko';
  const none = isKo ? '없음' : 'None';
  return [
    'Format the following data into a daily briefing.',
    'Output exactly 4 sections in this format:',
    '',
    isKo ? '**오늘 마감해야 할 일**' : '**Due Today**',
    '- item 1',
    '- item 2',
    '',
    isKo ? '**주요 일정**' : '**Key Events**',
    '- item 1',
    '',
    isKo ? '**날씨**' : '**Weather**',
    'location',
    '- detail 1',
    '',
    isKo ? '**국제 이슈**' : '**World News**',
    '- news 1',
    '',
    '---DATA---',
    '',
    isKo ? '오늘 마감:' : 'Due today:',
    payload.tasksText || none,
    '',
    isKo ? '일정:' : 'Events:',
    payload.eventsText || none,
    '',
    isKo ? '날씨:' : 'Weather:',
    payload.weatherText || none,
    '',
    isKo ? '뉴스:' : 'News:',
    payload.newsText || none,
  ].join('\n');
};

const buildTranslatePrompt = (text: string, target: string) => {
  return [
    'You are a professional translator.',
    `Translate the following text to ${target}.`,
    'Return only the translated text, no extra commentary.',
    '',
    text,
  ].join('\n');
};

export function AIAssistantPanel({ compact = false }: { compact?: boolean }) {
  const { currentAccountId } = useAccountsStore();
  const { addTokens, incrementPending, decrementPending, addCompleted } = useAiStore();
  const { events } = useCalendarStore();
  const { taskLists, tasks } = useTasksStore();
  const { briefingLocation, briefingLanguage, briefingNewsKeyword, briefingLocationCoords } = usePreferencesStore();
  const [activeTab, setActiveTab] = useState<TabKey>('briefing');
  const [briefingText, setBriefingText] = useState('');
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingUpdatedAt, setBriefingUpdatedAt] = useState<Date | null>(null);
  const [weatherText, setWeatherText] = useState('');
  const [newsText, setNewsText] = useState('');
  const [briefingCacheLoaded, setBriefingCacheLoaded] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '안녕하세요! 무엇을 도와드릴까요?' },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [translateInput, setTranslateInput] = useState('');
  const [translateOutput, setTranslateOutput] = useState('');
  const [translateTarget, setTranslateTarget] = useState('한국어');
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateCopied, setTranslateCopied] = useState(false);

  const [today, setToday] = useState(() => new Date());
  const todayKey = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);
  const todayStart = useMemo(() => startOfDay(today), [today]);
  const todayEnd = useMemo(() => endOfDay(today), [today]);
  const dateLabel = useMemo(() => {
    if (briefingLanguage === 'en') {
      return format(today, 'MMM d (EEE)');
    }
    return format(today, 'M월 d일(EEE)', { locale: ko });
  }, [today, briefingLanguage]);

  const briefingCacheKey = useMemo(() => {
    const coords = briefingLocationCoords
      ? `${briefingLocationCoords.lat},${briefingLocationCoords.lon}`
      : '';
    return `briefing-cache-v1:${briefingLanguage}:${briefingLocation}:${briefingNewsKeyword}:${coords}`;
  }, [briefingLanguage, briefingLocation, briefingNewsKeyword, briefingLocationCoords]);

  const dueTasks = useMemo(() => {
    const allTasks: Task[] = taskLists.flatMap((list) => tasks[list.id] || []);
    return allTasks.filter((task) => {
      if (task.completed || !task.due) return false;
      const dueDate = new Date(task.due);
      return dueDate >= todayStart && dueDate <= todayEnd;
    });
  }, [taskLists, tasks, todayStart, todayEnd]);

  const todayEvents = useMemo(() => {
    return events
      .filter((event: CalendarEvent) => {
        const start = new Date(event.start);
        const end = new Date(event.end);
        return start <= todayEnd && end >= todayStart;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, todayStart, todayEnd]);

  const tasksText = useMemo(() => {
    if (dueTasks.length === 0) return '';
    return dueTasks
      .slice(0, 6)
      .map((task) => {
        const due = task.due ? new Date(task.due) : null;
        const time = due ? formatTime(due) : '시간 미정';
        return `- ${task.title} (${time})`;
      })
      .join('\n');
  }, [dueTasks]);

  const eventsText = useMemo(() => {
    if (todayEvents.length === 0) return '';
    return todayEvents
      .slice(0, 6)
      .map((event) => {
        const start = new Date(event.start);
        const label = event.allDay ? '종일' : `${formatTime(start)}`;
        return `- ${event.title} (${label})`;
      })
      .join('\n');
  }, [todayEvents]);

  const briefingSections = useMemo(() => parseBriefingText(briefingText), [briefingText]);
  const newsEntries = useMemo(() => {
    if (isEmptyBriefingValue(newsText)) return [];
    return parseBulletEntries(newsText);
  }, [newsText]);
  const mergedBriefingSections = useMemo(() => {
    if (newsEntries.length === 0) return briefingSections;
    let replaced = false;
    const next = briefingSections.map((section) => {
      if (isNewsSectionTitle(section.title)) {
        replaced = true;
        return { ...section, entries: newsEntries };
      }
      return section;
    });
    if (!replaced) {
      next.push({
        title: briefingLanguage === 'en' ? 'World news' : '국제 이슈',
        entries: newsEntries,
      });
    }
    return next;
  }, [briefingSections, newsEntries, briefingLanguage]);

  const generateBriefing = async (forceRefresh = false) => {
    if (!window.electronAPI?.aiGenerate) return;
    setBriefingLoading(true);
    const now = forceRefresh ? new Date() : today;
    const promptDateKey = format(now, 'yyyy-MM-dd');
    const promptDateLabel =
      briefingLanguage === 'en'
        ? format(now, 'MMM d (EEE)')
        : format(now, 'M월 d일(EEE)', { locale: ko });
    incrementPending();
    try {
      let weather = weatherText;
      let news = newsText;
      if (!weather || !news || forceRefresh) {
        const language = briefingLanguage === 'en' ? 'en' : 'ko';
        const [weatherRes, newsRes] = await Promise.all([
          window.electronAPI.aiGetWeather?.({
            location: briefingLocation,
            language,
            latitude: briefingLocationCoords?.lat,
            longitude: briefingLocationCoords?.lon,
          }),
          window.electronAPI.aiGetNews?.({
            keyword: briefingNewsKeyword,
            language,
            force: forceRefresh,
          }),
        ]);
        weather = weatherRes?.text || (language === 'ko' ? '연동 실패' : 'Unavailable');
        news = newsRes?.text || (language === 'ko' ? '연동 실패' : 'Unavailable');
        setWeatherText(weather);
        setNewsText(news);
      }
      const prompt = buildBriefingPrompt({
        dateLabel: promptDateLabel,
        tasksText,
        eventsText,
        weatherText: weather,
        newsText: news,
        language: briefingLanguage === 'en' ? 'en' : 'ko',
      });
      const result = await window.electronAPI.aiGenerate({ prompt });
      const nextText = result?.text?.trim() || '브리핑을 생성하지 못했습니다.';
      const nextUpdatedAt = new Date();
      if (forceRefresh) {
        setToday(now);
      }
      setBriefingText(nextText);
      setBriefingUpdatedAt(nextUpdatedAt);
      try {
        localStorage.setItem(
          briefingCacheKey,
          JSON.stringify({
            dateKey: promptDateKey,
            updatedAt: nextUpdatedAt.toISOString(),
            text: nextText,
            weather,
            news,
          })
        );
      } catch (error) {
        console.warn('Failed to cache briefing', error);
      }
      addTokens(result?.promptTokens || 0, result?.evalTokens || 0);
    } catch {
      setBriefingText('브리핑 생성에 실패했습니다.');
    } finally {
      decrementPending();
      addCompleted();
      setBriefingLoading(false);
    }
  };

  useEffect(() => {
    try {
      const cachedRaw = localStorage.getItem(briefingCacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached?.dateKey === todayKey) {
          setBriefingText(cached.text || '');
          setWeatherText(cached.weather || '');
          setNewsText(cached.news || '');
          setBriefingUpdatedAt(cached.updatedAt ? new Date(cached.updatedAt) : null);
          setBriefingCacheLoaded(true);
          return;
        }
      }
    } catch (error) {
      console.warn('Failed to read briefing cache', error);
    }
    setBriefingText('');
    setWeatherText('');
    setNewsText('');
    setBriefingUpdatedAt(null);
    setBriefingCacheLoaded(true);
  }, [briefingCacheKey, todayKey]);

  useEffect(() => {
    if (!briefingCacheLoaded) return;
    if (!briefingText && currentAccountId) {
      generateBriefing();
    }
  }, [briefingCacheLoaded, briefingText, currentAccountId]);

  useEffect(() => {
    if (activeTab !== 'chat') return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages, chatLoading, activeTab]);

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || !window.electronAPI?.aiGenerate) return;
    setChatInput('');
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user' as const, content: text }];
    setChatMessages(nextMessages);
    setChatLoading(true);
    incrementPending();
    try {
      const history = nextMessages.slice(-8);
      const prompt = buildChatPrompt(history);
      const result = await window.electronAPI.aiGenerate({ prompt });
      const reply = result?.text?.trim() || '답변을 생성하지 못했습니다.';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      addTokens(result?.promptTokens || 0, result?.evalTokens || 0);
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: '답변 생성에 실패했습니다.' }]);
    } finally {
      decrementPending();
      addCompleted();
      setChatLoading(false);
    }
  };

  const handleTranslate = async () => {
    const text = translateInput.trim();
    if (!text || !window.electronAPI?.aiGenerate) return;
    setTranslateLoading(true);
    incrementPending();
    try {
      const prompt = buildTranslatePrompt(text, translateTarget);
      const result = await window.electronAPI.aiGenerate({ prompt });
      setTranslateOutput(result?.text?.trim() || '번역 결과가 없습니다.');
      addTokens(result?.promptTokens || 0, result?.evalTokens || 0);
    } catch {
      setTranslateOutput('번역에 실패했습니다.');
    } finally {
      decrementPending();
      addCompleted();
      setTranslateLoading(false);
    }
  };

  const handleCopyTranslate = async () => {
    if (!translateOutput.trim()) return;
    try {
      await navigator.clipboard.writeText(translateOutput);
      setTranslateCopied(true);
      window.setTimeout(() => setTranslateCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy translation', error);
      setTranslateCopied(false);
    }
  };

  return (
    <div className={cn('ai-assistant-panel', compact && 'ai-assistant-panel-compact')}>
      <div className="ai-assistant-header">
        <div className="ai-assistant-title">
          <Sparkles className="h-4 w-4" />
          <span>AI 비서</span>
        </div>
        <div className="ai-assistant-tabs">
          <button
            className={cn('ai-assistant-tab', activeTab === 'briefing' && 'ai-assistant-tab-active')}
            onClick={() => setActiveTab('briefing')}
          >
            브리핑
          </button>
          <button
            className={cn('ai-assistant-tab', activeTab === 'chat' && 'ai-assistant-tab-active')}
            onClick={() => setActiveTab('chat')}
          >
            챗봇
          </button>
          <button
            className={cn('ai-assistant-tab', activeTab === 'translate' && 'ai-assistant-tab-active')}
            onClick={() => setActiveTab('translate')}
          >
            번역
          </button>
        </div>
      </div>

      {activeTab === 'briefing' ? (
        <div className="ai-assistant-briefing">
          <div className="ai-briefing-header">
            <div>
              <div className="ai-briefing-title">오늘 브리핑</div>
              <div className="ai-briefing-date">{dateLabel}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => generateBriefing(true)}
              disabled={briefingLoading}
              title="새로고침"
            >
              <RefreshCw className={cn('h-4 w-4', briefingLoading && 'animate-spin')} />
            </Button>
          </div>
          <div className="ai-briefing-card">
            {briefingLoading ? (
              <div className="text-xs text-muted-foreground">브리핑 생성 중...</div>
            ) : mergedBriefingSections.length > 0 ? (
              <div className="ai-briefing-grid">
                {mergedBriefingSections.map((section, index) => (
                  <div key={`${section.title}-${index}`} className="ai-briefing-section">
                    <div className="ai-briefing-section-title">{section.title}</div>
                    <div className="ai-briefing-section-body">
                      {section.entries.map((entry, entryIndex) => {
                        if (entry.kind === 'bullet') {
                          return (
                            <div key={`b-${entryIndex}`} className="ai-briefing-bullet">
                              <span className="ai-briefing-bullet-dot" />
                              <span>{renderBoldInline(entry.text)}</span>
                            </div>
                          );
                        }
                        const splitIndex = entry.text.indexOf(':');
                        if (splitIndex > 0) {
                          const label = entry.text.slice(0, splitIndex).trim();
                          const value = entry.text.slice(splitIndex + 1).trim();
                          return (
                            <div key={`t-${entryIndex}`} className="ai-briefing-kv">
                              <span className="ai-briefing-kv-label">{renderBoldInline(label)}</span>
                              <span className="ai-briefing-kv-value">{renderBoldInline(value || '-')}</span>
                            </div>
                          );
                        }
                        return (
                          <div key={`t-${entryIndex}`} className="ai-briefing-line">
                            {renderBoldInline(entry.text)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ai-briefing-text">
                {briefingText || '브리핑을 생성해 보세요.'}
              </div>
            )}
          </div>
          {briefingUpdatedAt && (
            <div className="ai-briefing-updated">
              업데이트: {format(briefingUpdatedAt, 'HH:mm')}
            </div>
          )}
        </div>
      ) : activeTab === 'chat' ? (
        <div className="ai-assistant-chat">
          <div className="ai-chat-messages">
            {chatMessages.map((msg, index) => (
              <div
                key={`${msg.role}-${index}`}
                className={cn('ai-chat-bubble', msg.role === 'user' ? 'ai-chat-user' : 'ai-chat-assistant')}
              >
                <div className="ai-chat-role">
                  {msg.role === 'user' ? '나' : 'AI'}
                </div>
                <div className="ai-chat-content">{msg.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="ai-chat-bubble ai-chat-assistant">
                <div className="ai-chat-role">AI</div>
                <div className="ai-chat-content">답변 생성 중...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="ai-chat-input">
            <Input
              placeholder="무엇이든 물어보세요"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
            />
            <Button size="icon" className="h-9 w-9" onClick={handleSendChat} disabled={!chatInput.trim() || chatLoading}>
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="ai-assistant-translate">
          <div className="ai-translate-header">
            <div className="ai-translate-title">AI 번역</div>
            <div className="ai-translate-controls">
              <span className="ai-translate-label">출력 언어</span>
              <select
                className="ai-translate-select"
                value={translateTarget}
                onChange={(e) => setTranslateTarget(e.target.value)}
              >
                <option value="한국어">한국어</option>
                <option value="영어">영어</option>
                <option value="일본어">일본어</option>
                <option value="중국어(간체)">중국어(간체)</option>
              </select>
            </div>
          </div>
          <textarea
            className="ai-translate-input"
            placeholder="번역할 텍스트를 입력하세요"
            value={translateInput}
            onChange={(e) => setTranslateInput(e.target.value)}
          />
          <Button
            className="ai-translate-button"
            onClick={handleTranslate}
            disabled={!translateInput.trim() || translateLoading}
          >
            {translateLoading ? '번역 중...' : '번역하기'}
          </Button>
          <div className="ai-translate-output">
            <Button
              size="sm"
              variant="ghost"
              className="ai-translate-copy"
              onClick={handleCopyTranslate}
              disabled={!translateOutput.trim()}
            >
              {translateCopied ? '복사됨' : '복사'}
            </Button>
            <div className="ai-translate-output-text">
              {translateOutput || '번역 결과가 여기에 표시됩니다.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
