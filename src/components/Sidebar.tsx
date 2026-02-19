import { useMemo, useEffect, useRef } from 'react';
import {
  Inbox,
  MailWarning,
  Send,
  Star,
  AlertCircle,
  FileText,
  Trash2,
  ShieldAlert,
  Mail,
  PenSquare,
} from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useEmailsStore } from '@/stores/emails';
import { Button } from '@/components/ui/button';
import { AIAssistantPanel } from '@/components/AIAssistantPanel';
import { cn } from '@/lib/utils';
import type { ViewType } from '@/types';

interface SidebarProps {
  onCompose: () => void;
}

const menuItems: { icon: typeof Inbox; label: string; view: ViewType }[] = [
  { icon: Inbox, label: '받은편지함', view: 'inbox' },
  { icon: MailWarning, label: '안읽은편지함', view: 'unread' },
  { icon: Send, label: '보낸편지함', view: 'sent' },
  { icon: Star, label: '별표편지함', view: 'starred' },
  { icon: AlertCircle, label: '중요', view: 'important' },
  { icon: FileText, label: '임시보관함', view: 'drafts' },
  { icon: Trash2, label: '휴지통', view: 'trash' },
  { icon: ShieldAlert, label: '스팸', view: 'spam' },
  { icon: Mail, label: '전체메일', view: 'all' },
];

export function Sidebar({ onCompose }: SidebarProps) {
  const { currentAccountId } = useAccountsStore();
  const { currentView, setCurrentView, emailsByView, emails, fetchEmailsForView } = useEmailsStore();
  const preloadedAccountRef = useRef<string | null>(null);

  // 안읽은 메일 수 계산
  const { unreadCount, totalCount, countsByView } = useMemo(() => {
    const accountViews = currentAccountId ? emailsByView[currentAccountId] || {} : {};
    // inbox 데이터가 있으면 사용, 없으면 현재 뷰가 inbox일 때만 emails 사용
    const inboxEmails = accountViews.inbox || (currentView === 'inbox' && currentAccountId ? emails[currentAccountId] || [] : []);
    const unread = accountViews.unread?.length || inboxEmails.filter(email => !email.isRead).length;
    const counts: Partial<Record<ViewType, number>> = {};
    (Object.keys(accountViews) as ViewType[]).forEach((view) => {
      counts[view] = accountViews[view]?.length || 0;
    });
    // inbox 카운트도 설정
    if (!counts.inbox && inboxEmails.length > 0) {
      counts.inbox = inboxEmails.length;
    }
    return { unreadCount: unread, totalCount: inboxEmails.length, countsByView: counts };
  }, [currentAccountId, currentView, emailsByView, emails]);

  useEffect(() => {
    if (!currentAccountId) return;
    if (preloadedAccountRef.current === currentAccountId) return;
    preloadedAccountRef.current = currentAccountId;

    const views: ViewType[] = ['inbox', 'unread', 'sent', 'starred', 'important', 'drafts', 'trash', 'spam', 'all'];
    views.forEach((view) => {
      fetchEmailsForView(currentAccountId, view);
    });
  }, [currentAccountId, fetchEmailsForView]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <Button onClick={onCompose} className="w-full gap-2">
          <PenSquare className="h-4 w-4" />
          편지쓰기
        </Button>
      </div>

      <nav className="flex-1 px-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;

          return (
            <button
              key={item.view}
              onClick={() => setCurrentView(item.view)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.view === 'inbox' && (countsByView.inbox || totalCount) > 0 && (
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                  'bg-muted text-muted-foreground'
                )}>
                  {countsByView.inbox || totalCount}
                </span>
              )}
              {item.view === 'unread' && unreadCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center bg-blue-500 text-white font-medium">
                  {unreadCount}
                </span>
              )}
              {item.view !== 'inbox' && item.view !== 'unread' && (countsByView[item.view] || 0) > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center bg-muted text-muted-foreground">
                  {countsByView[item.view]}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t p-2 ai-assistant-sidebar">
        <AIAssistantPanel compact />
      </div>
    </div>
  );
}
