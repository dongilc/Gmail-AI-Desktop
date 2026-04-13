import { Fragment, useEffect } from 'react';
import { useAccountsStore } from '@/stores/accounts';
import { usePreferencesStore } from '@/stores/preferences';
import { setAppTimezone } from '@/lib/timezone';
import { Dashboard } from '@/components/Dashboard';
import { WelcomeScreen } from '@/components/WelcomeScreen';

function App() {
  const { accounts, fetchAccounts, isLoading } = useAccountsStore();
  const appTimezone = usePreferencesStore((s) => s.appTimezone);

  // Sync module-level timezone synchronously on every render before children run.
  setAppTimezone(appTimezone);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  if (isLoading && accounts.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // key={appTimezone} forces subtree remount so every child re-renders with the new tz.
  return (
    <Fragment key={appTimezone}>
      {accounts.length === 0 ? <WelcomeScreen /> : <Dashboard />}
    </Fragment>
  );
}

export default App;
