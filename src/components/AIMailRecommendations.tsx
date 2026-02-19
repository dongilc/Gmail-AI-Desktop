import { useState, useMemo, useCallback, useRef } from 'react';
import { Lightbulb, RefreshCw, Mail, X } from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useEmailsStore } from '@/stores/emails';
import { useAiStore } from '@/stores/ai';
import { usePreferencesStore } from '@/stores/preferences';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Email } from '@/types';

type RecommendedEmail = {
  id: string;
  accountId: string;
  subject: string;
  from: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
};

const REASON_OPTIONS = [
  '답변 필요',
  '확인 필요',
  '마감 임박',
  '회의 관련',
  '중요 공지',
  '결제 관련',
  '일정 확인',
  '승인 필요',
  '제출 필요',
  '열람 권장',
] as const;

const buildRecommendPrompt = (emails: { subject: string; from: string; snippet: string; date: string }[]) => {
  return [
    'Return ONLY JSON array. No text, no markdown.',
    '',
    'Example: [{"index":0,"reason":"답변 필요","priority":"high"}]',
    '',
    'STRICT RULES:',
    '- MAX 5 emails only',
    '- EXCLUDE: ads, promotions, newsletters, sale/discount, shipping updates, membership offers',
    '- INCLUDE ONLY: work emails, personal requests, deadlines, meetings, official notices',
    '- priority: high (urgent/deadline), medium (should check), low (fyi)',
    `- reason: MUST be one of these exactly: ${REASON_OPTIONS.join(', ')}`,
    '',
    '---EMAILS---',
    ...emails.map((e, i) => `[${i}] ${e.from} | ${e.subject}`),
    '---END---',
    '',
    'JSON:',
  ].join('\n');
};

const parseRecommendations = (
  text: string,
  emails: (Email & { accountId: string })[]
): RecommendedEmail[] => {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const validReasons = new Set<string>(REASON_OPTIONS);

    return parsed
      .filter((item: any) => typeof item.index === 'number' && item.index >= 0 && item.index < emails.length)
      .map((item: any) => {
        const email = emails[item.index];
        const reason = typeof item.reason === 'string' && validReasons.has(item.reason)
          ? item.reason
          : '확인 필요';
        return {
          id: email.id,
          accountId: email.accountId,
          subject: email.subject || '(제목 없음)',
          from: email.from?.name || email.from?.email || '알 수 없음',
          reason,
          priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
        };
      });
  } catch {
    return [];
  }
};

export function AIMailRecommendations() {
  const { accounts } = useAccountsStore();
  const { emails, setCurrentView, setScrollTargetEmailId, fetchEmail } = useEmailsStore();
  const { setCurrentAccount } = useAccountsStore();
  const { enqueueTask, cancelTask, addTokens } = useAiStore();
  const { aiMailRecommendDays, aiMailRecommendEnabled, aiConcurrentTasks } = usePreferencesStore();

  const [recommendations, setRecommendations] = useState<RecommendedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const currentTaskIdRef = useRef<string | null>(null);

  // 모든 계정의 이메일을 합침
  const allAccountEmails = useMemo(() => {
    const allEmails: (Email & { accountId: string })[] = [];
    for (const account of accounts) {
      const accountEmailList = emails[account.id] || [];
      accountEmailList.forEach((email) => {
        allEmails.push({ ...email, accountId: account.id });
      });
    }
    return allEmails;
  }, [emails, accounts]);

  const unreadEmails = useMemo(() => {
    if (allAccountEmails.length === 0) return [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - aiMailRecommendDays);

    // 광고/프로모션 라벨 필터링 (CATEGORY_UPDATES는 중요 알림일 수 있으므로 제외)
    const promotionalLabels = [
      'CATEGORY_PROMOTIONS',
      'CATEGORY_SOCIAL',
      'CATEGORY_FORUMS',
    ];

    return allAccountEmails
      .filter((email) => {
        if (email.isRead) return false;
        const emailDate = new Date(email.date);
        if (emailDate < cutoffDate) return false;

        // 광고성 라벨이 있으면 제외
        if (email.labels?.some((label) => promotionalLabels.includes(label))) {
          return false;
        }

        return true;
      })
      .slice(0, 30); // 더 적은 수로 제한
  }, [allAccountEmails, aiMailRecommendDays]);

  const generateRecommendations = useCallback(() => {
    if (!window.electronAPI?.aiGenerate || unreadEmails.length === 0) {
      setRecommendations([]);
      return;
    }

    // 이전 작업이 있으면 취소
    if (currentTaskIdRef.current) {
      cancelTask(currentTaskIdRef.current);
      currentTaskIdRef.current = null;
    }

    setIsLoading(true);
    setError(null);

    const taskId = enqueueTask(async () => {
      try {
        const emailData = unreadEmails.map((e) => ({
          subject: e.subject || '',
          from: e.from?.name || e.from?.email || '',
          snippet: e.snippet || '',
          date: new Date(e.date).toLocaleDateString('ko-KR'),
        }));

        const prompt = buildRecommendPrompt(emailData);
        const result = await window.electronAPI.aiGenerate({ prompt });

        if (result?.text) {
          const recs = parseRecommendations(result.text, unreadEmails);
          setRecommendations(recs);
          addTokens(result.promptTokens || 0, result.evalTokens || 0);
        } else {
          setRecommendations([]);
        }
      } catch (err) {
        setError('추천 생성 실패');
        setRecommendations([]);
      } finally {
        setIsLoading(false);
        setHasRun(true);
        currentTaskIdRef.current = null;
      }
    }, aiConcurrentTasks || 1);

    currentTaskIdRef.current = taskId;
  }, [unreadEmails, enqueueTask, cancelTask, addTokens, aiConcurrentTasks]);

  // 자동 실행 제거 - 새로고침 버튼 클릭 시에만 작동

  const handleEmailClick = async (rec: RecommendedEmail) => {
    // 팝업 먼저 닫기
    setIsPopupOpen(false);

    // 해당 계정으로 전환
    setCurrentAccount(rec.accountId);

    // 받은편지함으로 이동
    setCurrentView('inbox');

    // 스크롤 타겟 설정 (이메일 목록에서 해당 메일로 스크롤)
    setScrollTargetEmailId(rec.id);

    // 이메일 상세 정보 가져와서 선택
    try {
      await fetchEmail(rec.accountId, rec.id);
    } catch (error) {
      console.error('[AI메일추천] 이메일 로드 실패:', error);
    }
  };

  if (!aiMailRecommendEnabled) {
    return null;
  }

  const priorityColors = {
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  const priorityLabels = {
    high: '긴급',
    medium: '중요',
    low: '참고',
  };

  const highPriorityCount = recommendations.filter((r) => r.priority === 'high').length;

  return (
    <div className="ai-mail-recommend-inline">
      {/* Compact single line trigger */}
      <button
        className="ai-mail-recommend-trigger"
        onClick={() => recommendations.length > 0 && setIsPopupOpen(true)}
        disabled={isLoading || recommendations.length === 0}
      >
        <Lightbulb className={cn('h-4 w-4', recommendations.length > 0 ? 'text-yellow-500' : 'text-muted-foreground')} />
        <span className="ai-mail-recommend-trigger-text">
          {isLoading
            ? 'AI메일추천 - 분석 중...'
            : !hasRun
              ? 'AI메일추천 - 새로고침을 눌러주세요'
              : recommendations.length > 0
                ? `AI메일추천 - ${recommendations.length}건${highPriorityCount > 0 ? ` (긴급 ${highPriorityCount})` : ''}`
                : 'AI메일추천 - 확인 필요 메일 없음'}
        </span>
        {recommendations.length > 0 && (
          <span className="ai-mail-recommend-trigger-badge">{recommendations.length}</span>
        )}
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={(e) => {
          e.stopPropagation();
          generateRecommendations();
        }}
        disabled={isLoading}
        title="새로고침"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
      </Button>

      {/* Popup */}
      {isPopupOpen && (
        <div className="ai-mail-recommend-overlay" onClick={() => setIsPopupOpen(false)}>
          <div className="ai-mail-recommend-popup" onClick={(e) => e.stopPropagation()}>
            <div className="ai-mail-recommend-popup-header">
              <div className="ai-mail-recommend-popup-title">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                <span>AI 메일 추천</span>
                <span className="text-xs text-muted-foreground">최근 {aiMailRecommendDays}일</span>
              </div>
              <button className="ai-mail-recommend-popup-close" onClick={() => setIsPopupOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="ai-mail-recommend-popup-content">
              {error ? (
                <div className="ai-mail-recommend-popup-empty text-destructive">{error}</div>
              ) : recommendations.length === 0 ? (
                <div className="ai-mail-recommend-popup-empty">
                  {unreadEmails.length === 0
                    ? '읽지 않은 메일이 없습니다'
                    : '특별히 주의가 필요한 메일이 없습니다'}
                </div>
              ) : (
                <div className="ai-mail-recommend-popup-list">
                  {recommendations.map((rec) => {
                    const account = accounts.find((a) => a.id === rec.accountId);
                    return (
                      <button
                        key={`${rec.accountId}-${rec.id}`}
                        className="ai-mail-recommend-popup-item"
                        onClick={() => handleEmailClick(rec)}
                      >
                        <span className={cn('ai-mail-recommend-popup-priority', priorityColors[rec.priority])}>
                          {priorityLabels[rec.priority]}
                        </span>
                        <div className="ai-mail-recommend-popup-item-content">
                          <div className="ai-mail-recommend-popup-item-subject">{rec.subject}</div>
                          <div className="ai-mail-recommend-popup-item-meta">
                            <span>{rec.from}</span>
                            <span className="ai-mail-recommend-popup-item-reason">{rec.reason}</span>
                          </div>
                          {account && (
                            <div className="ai-mail-recommend-popup-item-account">
                              {account.email}
                            </div>
                          )}
                        </div>
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ai-mail-recommend-popup-footer">
              <Button
                variant="outline"
                size="sm"
                onClick={generateRecommendations}
                disabled={isLoading}
                className="h-7 text-xs"
              >
                <RefreshCw className={cn('h-3 w-3 mr-1', isLoading && 'animate-spin')} />
                다시 분석
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
