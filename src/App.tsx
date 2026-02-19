import { useEffect } from 'react';
import { useAccountsStore } from '@/stores/accounts';
import { Dashboard } from '@/components/Dashboard';
import { WelcomeScreen } from '@/components/WelcomeScreen';

function App() {
  const { accounts, fetchAccounts, isLoading } = useAccountsStore();

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // 로딩 중일 때
  if (isLoading && accounts.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // 계정이 없으면 Welcome 화면
  if (accounts.length === 0) {
    return <WelcomeScreen />;
  }

  // 계정이 있으면 Dashboard
  return <Dashboard />;
}

export default App;
