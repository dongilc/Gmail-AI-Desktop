import { Plus, LogOut, Check } from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useEmailsStore } from '@/stores/emails';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

export function AccountSwitcher() {
  const { accounts, currentAccountId, setCurrentAccount, login, logout, isLoading } =
    useAccountsStore();
  const { setSelectedEmail, setCurrentView, setComposing } = useEmailsStore();

  const handleSwitchAccount = (accountId: string) => {
    if (accountId !== currentAccountId) {
      setSelectedEmail(null); // 계정 변경 시 선택된 이메일 초기화
      setCurrentView('inbox'); // 계정 전환 시 받은편지함으로 초기화
      setComposing(false);
    }
    setCurrentAccount(accountId);
  };

  const handleAddAccount = async () => {
    await login();
  };

  const handleLogout = async (accountId: string) => {
    await logout(accountId);
  };

  return (
    <div className="flex items-center gap-1 p-2">
      {accounts.map((account) => (
        <ContextMenu key={account.id}>
          <ContextMenuTrigger>
            <button
              onClick={() => handleSwitchAccount(account.id)}
              className={cn(
                'relative rounded-full transition-all',
                currentAccountId === account.id
                  ? 'ring-2 ring-primary ring-offset-2'
                  : 'opacity-60 hover:opacity-100'
              )}
              title={account.email}
            >
              <Avatar src={account.picture} alt={account.name} size="md" />
              {currentAccountId === account.id && (
                <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{account.name}</p>
              <p className="text-xs text-muted-foreground">{account.email}</p>
            </div>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => handleLogout(account.id)}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              로그아웃
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}

      {accounts.length < 4 && (
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-10 w-10"
          onClick={handleAddAccount}
          disabled={isLoading}
          title="계정 추가"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
