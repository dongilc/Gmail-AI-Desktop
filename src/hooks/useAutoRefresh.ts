import { useEffect, useRef } from 'react';
import { useAccountsStore } from '@/stores/accounts';
import { useEmailsStore } from '@/stores/emails';
import { useCalendarStore } from '@/stores/calendar';
import { useTasksStore } from '@/stores/tasks';
import { usePreferencesStore } from '@/stores/preferences';

export function useAutoRefresh() {
  const autoRefreshEnabled = usePreferencesStore((s) => s.autoRefreshEnabled);
  const autoRefreshInterval = usePreferencesStore((s) => s.autoRefreshInterval);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const intervalMs = autoRefreshInterval * 60 * 1000;

    const doRefresh = async () => {
      if (isRefreshingRef.current) return;

      const accountId = useAccountsStore.getState().currentAccountId;
      if (!accountId) return;

      isRefreshingRef.current = true;
      console.log('[AutoRefresh] 시작', new Date().toLocaleTimeString());

      try {
        // 이메일 증분 동기화
        await window.electronAPI.syncEmails(accountId);

        // 현재 뷰 새로고침
        const currentView = useEmailsStore.getState().currentView;
        await useEmailsStore.getState().fetchEmailsForView(accountId, currentView);

        // 캘린더 새로고침
        await useCalendarStore.getState().fetchEvents(accountId);

        // 할 일 새로고침
        const selectedTaskListId = useTasksStore.getState().selectedTaskListId;
        if (selectedTaskListId) {
          await useTasksStore.getState().fetchTasks(accountId, selectedTaskListId);
        }

        console.log('[AutoRefresh] 완료', new Date().toLocaleTimeString());
      } catch (error) {
        console.error('[AutoRefresh] 실패:', error);
      } finally {
        isRefreshingRef.current = false;
      }
    };

    const timer = setInterval(doRefresh, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [autoRefreshEnabled, autoRefreshInterval]);
}
