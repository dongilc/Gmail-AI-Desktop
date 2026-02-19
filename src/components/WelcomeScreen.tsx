import { Mail, Loader2 } from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { Button } from '@/components/ui/button';

export function WelcomeScreen() {
  const { login, isLoading, error } = useAccountsStore();

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center space-y-6 p-8">
        <div className="flex justify-center">
          <div className="bg-primary/10 p-6 rounded-full">
            <Mail className="h-16 w-16 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Gmail Desktop</h1>
          <p className="text-muted-foreground max-w-md">
            여러 Gmail 계정을 한 곳에서 관리하세요.
            <br />
            캘린더와 할 일 목록도 함께 확인할 수 있습니다.
          </p>
        </div>

        <Button
          size="lg"
          onClick={login}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Mail className="h-5 w-5" />
          )}
          Google 계정으로 시작하기
        </Button>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>최대 4개의 계정을 추가할 수 있습니다.</p>
          <p>Gmail, Calendar, Tasks API를 사용합니다.</p>
        </div>
      </div>
    </div>
  );
}
