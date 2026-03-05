import { useState, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useEmailsStore } from '@/stores/emails';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SearchBar() {
  const { currentAccountId } = useAccountsStore();
  const { searchQuery, setSearchQuery, searchEmails, fetchEmails, currentView, emails } = useEmailsStore();
  const [inputValue, setInputValue] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (currentAccountId && inputValue.trim()) {
        setIsSearching(true);
        try {
          await searchEmails(currentAccountId, inputValue.trim());
        } finally {
          setIsSearching(false);
        }
      }
    },
    [currentAccountId, inputValue, searchEmails]
  );

  const handleClear = useCallback(() => {
    setInputValue('');
    setSearchQuery('');
    if (currentAccountId) {
      fetchEmails(currentAccountId, currentView);
    }
  }, [currentAccountId, currentView, fetchEmails, setSearchQuery]);

  const resultCount = currentAccountId ? (emails[currentAccountId] || []).length : 0;

  return (
    <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1" style={{ maxWidth: '42rem' }}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="메일 검색..."
          className="pl-9 pr-9 h-9 text-foreground placeholder:text-muted-foreground/60 border-border/60"
        />
        {inputValue && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isSearching ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>검색중...</span>
        </div>
      ) : searchQuery ? (
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          검색결과 <span className="font-medium text-foreground">{resultCount}</span>건
        </div>
      ) : null}
    </form>
  );
}
