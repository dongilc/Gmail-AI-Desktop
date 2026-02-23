import { useState, useCallback } from 'react';
import { BookUser, Trash2, Search, X, RefreshCw, Mail } from 'lucide-react';
import { useContactsStore } from '@/stores/contacts';
import { useEmailsStore } from '@/stores/emails';
import { useAccountsStore } from '@/stores/accounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function ContactsDialog() {
  const contacts = useContactsStore((s) => s.contacts);
  const accounts = useAccountsStore((s) => s.accounts);
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [open, setOpen] = useState(false);

  const allContacts = Object.values(contacts);
  const filtered = search.trim()
    ? allContacts.filter(
        (c) =>
          c.email.toLowerCase().includes(search.toLowerCase()) ||
          c.name.toLowerCase().includes(search.toLowerCase())
      )
    : allContacts;

  const sorted = [...filtered].sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return b.lastSeen - a.lastSeen;
  });

  const handleClearAll = useCallback(() => {
    useContactsStore.setState({ contacts: {} });
  }, []);

  const handleDelete = useCallback((email: string) => {
    const key = email.toLowerCase();
    useContactsStore.setState((state) => {
      const next = { ...state.contacts };
      delete next[key];
      return { contacts: next };
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const accts = useAccountsStore.getState().accounts;
      const { fetchEmails, currentView } = useEmailsStore.getState();
      for (const account of accts) {
        await fetchEmails(account.id, currentView);
      }
    } catch (error) {
      console.error('Failed to refresh contacts:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleComposeTo = useCallback((toEmail: string, accountId: string) => {
    useAccountsStore.getState().setCurrentAccount(accountId);
    useEmailsStore.getState().startCompose(toEmail);
    setOpen(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <BookUser className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{'연락처'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-[52rem]">
        <DialogHeader>
          <DialogTitle>{'연락처'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {'이메일에서 자동 수집된 연락처'} ({allContacts.length}{'개'})
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? '수집 중...' : '다시 수집'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleClearAll}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {'전체 삭제'}
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={'이름 또는 이메일 검색...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm pl-8"
            />
          </div>

          <ScrollArea className="h-[420px] border rounded-md">
            {sorted.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
                {search ? '검색 결과 없음' : '저장된 연락처가 없습니다'}
              </div>
            ) : (
              <div className="divide-y">
                {sorted.map((c) => (
                  <div key={c.email} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {c.name ? (
                          <>
                            <span className="font-medium truncate">{c.name}</span>
                            <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                          </>
                        ) : (
                          <span className="truncate">{c.email}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.frequency}{'회'} &middot; {new Date(c.lastSeen).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      {accounts.length <= 1 ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary"
                                onClick={() => handleComposeTo(c.email, accounts[0]?.id)}
                              >
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{'메일 쓰기'}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Popover>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-primary"
                                  >
                                    <Mail className="h-3.5 w-3.5" />
                                  </Button>
                                </PopoverTrigger>
                              </TooltipTrigger>
                              <TooltipContent>{'메일 쓰기'}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <PopoverContent align="end" className="w-auto p-1">
                            <p className="px-2 py-1 text-xs text-muted-foreground">{'보낼 계정 선택'}</p>
                            {accounts.map((account) => (
                              <button
                                key={account.id}
                                className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer"
                                onClick={() => handleComposeTo(c.email, account.id)}
                              >
                                {account.email}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(c.email)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
