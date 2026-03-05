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

      const accounts = useAccountsStore.getState().accounts;
      const currentAccountId = useAccountsStore.getState().currentAccountId;
      if (accounts.length === 0) return;

      isRefreshingRef.current = true;
      console.log('[AutoRefresh] 시작 - 전체 계정 동기화', new Date().toLocaleTimeString());

      try {
        // 모든 계정 이메일 증분 동기화 (순차 처리)
        const setSyncingAccount = useEmailsStore.getState().setSyncingAccount;
        for (const account of accounts) {
          try {
            setSyncingAccount(account.id, true);
            await window.electronAPI.syncEmails(account.id);
            console.log(`[AutoRefresh] 계정 동기화 완료: ${account.email}`);
          } catch (err) {
            console.error(`[AutoRefresh] 계정 동기화 실패: ${account.email}`, err);
          } finally {
            setSyncingAccount(account.id, false);
          }
        }

        // 현재 계정만 UI 새로고침
        if (currentAccountId) {
          const currentView = useEmailsStore.getState().currentView;
          await useEmailsStore.getState().fetchEmailsForView(currentAccountId, currentView);

          await useCalendarStore.getState().fetchEvents(currentAccountId);

          const selectedTaskListId = useTasksStore.getState().selectedTaskListId;
          if (selectedTaskListId) {
            await useTasksStore.getState().fetchTasks(currentAccountId, selectedTaskListId);
          }
        }

        console.log('[AutoRefresh] 완료', new Date().toLocaleTimeString());
      } catch (error) {
        console.error('[AutoRefresh] 실패:', error);
      } finally {
        isRefreshingRef.current = false;
      }
    };

    // 시작 직후 1회 실행 (5초 딜레이로 앱 초기화 대기)
    const initialTimer = setTimeout(doRefresh, 5000);
    const timer = setInterval(doRefresh, intervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [autoRefreshEnabled, autoRefreshInterval]);
}
