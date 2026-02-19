import { useEffect } from 'react';
import { useAiStore } from '@/stores/ai';
import { usePreferencesStore } from '@/stores/preferences';
import { cn } from '@/lib/utils';

export function AIStatus() {
  const {
    pendingCount,
    queuedCount,
    serverStatus,
    completedTimestamps,
    totalPromptTokens,
    totalEvalTokens,
    setServerStatus,
  } = useAiStore();
  const { aiMonthlyTokenCap } = usePreferencesStore();

  useEffect(() => {
    let isMounted = true;

    const check = async () => {
      try {
        setServerStatus('checking');
        const result = await window.electronAPI.aiHealth();
        if (!isMounted) return;
        setServerStatus(result?.ok ? 'online' : 'offline');
      } catch {
        if (!isMounted) return;
        setServerStatus('offline');
      }
    };

    check();
    const id = window.setInterval(check, 15000);
    return () => {
      isMounted = false;
      window.clearInterval(id);
    };
  }, [setServerStatus]);

  const statusLabel =
    serverStatus === 'online'
      ? 'AI서버 연결됨'
      : serverStatus === 'checking'
        ? 'AI서버 확인중'
        : 'AI서버 오프라인';

  const pendingLabel = `현재 작업중 ${pendingCount}개`;
  const queueLabel = `대기 ${queuedCount}개`;
  const now = Date.now();
  const perMinute = completedTimestamps.filter((ts) => ts >= now - 60_000).length;
  const throughputLabel = `1분당 ${perMinute}건`;
  const totalTokens = totalPromptTokens + totalEvalTokens;
  const maxTokens = Math.max(1, aiMonthlyTokenCap || 1);
  const tokenPercent = Math.min(100, Math.round((totalTokens / maxTokens) * 100));

  return (
    <div className="ai-status no-drag">
      <span className={cn('ai-status-dot', `ai-status-${serverStatus}`)} />
      <span className="ai-status-text">{statusLabel}</span>
      <span className="ai-status-sep">·</span>
      <span className="ai-status-text">{pendingLabel}</span>
      <span className="ai-status-sep">·</span>
      <span className="ai-status-text">{queueLabel}</span>
      <span className="ai-status-sep">·</span>
      <span className="ai-status-text">{throughputLabel}</span>
      <span className="ai-status-sep">·</span>
      <div className="ai-token-meter" title={`월간 누적 ${totalTokens} tok / Max ${maxTokens} tok`}>
        <span
          className="ai-token-ring"
          style={{ ['--ai-token-percent' as any]: `${tokenPercent}%` }}
          aria-hidden="true"
        />
        <span className="ai-token-text">월간 {tokenPercent}%</span>
      </div>
    </div>
  );
}
