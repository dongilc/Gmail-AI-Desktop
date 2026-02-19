import { useState, useEffect, useCallback } from 'react';
import { useEmailsStore } from '@/stores/emails';
import { useTasksStore } from '@/stores/tasks';
import { useCalendarStore } from '@/stores/calendar';
import { useThemeStore } from '@/stores/theme';
import { usePreferencesStore } from '@/stores/preferences';
import { Loader2 } from 'lucide-react';
import { AccountSwitcher } from './AccountSwitcher';
import { Sidebar } from './Sidebar';
import { EmailList } from './EmailList';
import { EmailView } from './EmailView';
import { Calendar } from './Calendar';
import { TodoList } from './TodoList';
import { QuickAddTodo } from './QuickAddTodo';
import { SearchBar } from './SearchBar';
import { SettingsDialog } from './SettingsDialog';
import { Resizer } from './ui/resizer';
import { AIStatus } from './AIStatus';
import { AIMailRecommendations } from './AIMailRecommendations';

export function Dashboard() {
  const { selectedEmail, startCompose, isLoading: isEmailLoading, isSyncing } = useEmailsStore();
  const { openQuickAdd, isLoading: isTasksLoading } = useTasksStore();
  const { isLoading: isCalendarLoading } = useCalendarStore();
  const { aiServerUrl, aiModel, aiTemperature, aiNumPredict } = usePreferencesStore();

  // 패널 크기 상태
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [emailListWidth, setEmailListWidth] = useState(480);
  const [rightPanelWidth, setRightPanelWidth] = useState(416);
  const [calendarHeight, setCalendarHeight] = useState(50); // percentage
  const [startupMinDone, setStartupMinDone] = useState(false);
  const [startupVisible, setStartupVisible] = useState(true);

  const handleCompose = useCallback(() => {
    startCompose();
  }, [startCompose]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + T: Quick add todo
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        openQuickAdd(selectedEmail || undefined);
      }

      // Ctrl/Cmd + N: New email
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleCompose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCompose, openQuickAdd, selectedEmail]);

  // 초기화: 테마 적용
  useEffect(() => {
    const { theme } = useThemeStore.getState();
    const root = document.documentElement;
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', isDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  }, []);

  useEffect(() => {
    window.electronAPI.aiSetConfig({
      baseUrl: aiServerUrl,
      model: aiModel,
      temperature: aiTemperature,
      numPredict: aiNumPredict,
    });
  }, [aiServerUrl, aiModel, aiTemperature, aiNumPredict]);

  useEffect(() => {
    const minTimer = window.setTimeout(() => setStartupMinDone(true), 1400);
    const maxTimer = window.setTimeout(() => setStartupVisible(false), 10000);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, []);

  const isBusy = isEmailLoading || isSyncing || isCalendarLoading || isTasksLoading;

  useEffect(() => {
    if (startupMinDone && !isBusy) {
      setStartupVisible(false);
    }
  }, [startupMinDone, isBusy]);

  const showStartupOverlay = startupVisible && isBusy;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 drag-region">
        <div className="flex items-center gap-4 no-drag">
          <AccountSwitcher />
          <AIStatus />
        </div>

        <div className="flex-1 flex justify-center no-drag">
          <AIMailRecommendations />
        </div>

        <div className="flex items-center gap-4 no-drag">
          <SearchBar />
          <SettingsDialog />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div style={{ width: sidebarWidth }} className="border-r bg-muted/30 flex flex-col shrink-0">
          <Sidebar onCompose={handleCompose} />
        </div>

        <Resizer
          direction="vertical"
          onResize={(delta) => setSidebarWidth((w) => Math.max(180, Math.min(350, w + delta)))}
        />

        {/* Email section */}
        <div className="flex-1 flex min-w-0">
          {/* Email list */}
          <div style={{ width: emailListWidth }} className="border-r flex flex-col min-h-0 shrink-0">
            <EmailList />
          </div>

          <Resizer
            direction="vertical"
            onResize={(delta) => setEmailListWidth((w) => Math.max(250, Math.min(500, w + delta)))}
          />

          {/* Email view */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <EmailView />
          </div>
        </div>

        <Resizer
          direction="vertical"
          onResize={(delta) => setRightPanelWidth((w) => Math.max(250, Math.min(450, w - delta)))}
        />

        {/* Right panel - Calendar & Todo */}
        <div style={{ width: rightPanelWidth }} className="border-l flex flex-col min-h-0 shrink-0">
          {/* Calendar */}
          <div style={{ height: `${calendarHeight}%` }} className="border-b overflow-hidden">
            <Calendar />
          </div>

          <Resizer
            direction="horizontal"
            onResize={(delta) => {
              const container = document.querySelector('.flex-1.flex.min-h-0');
              if (container) {
                const height = container.clientHeight;
                const deltaPercent = (delta / height) * 100;
                setCalendarHeight((h) => Math.max(20, Math.min(80, h + deltaPercent)));
              }
            }}
          />

          {/* Todo */}
          <div style={{ height: `${100 - calendarHeight}%` }} className="overflow-hidden">
            <TodoList />
          </div>
        </div>
      </div>

      {/* Quick add todo modal */}
      <QuickAddTodo />

      {showStartupOverlay && (
        <div className="fixed inset-0 z-[9999] bg-background/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-14 w-14 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
}
