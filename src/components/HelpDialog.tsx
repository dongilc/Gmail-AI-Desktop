import { useState, useEffect } from 'react';
import { HelpCircle, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const shortcuts = [
  { keys: 'Ctrl + N', desc: '새 메일 작성' },
  { keys: 'Ctrl + T', desc: '할 일 추가' },
  { keys: 'Ctrl + F', desc: '메일 검색' },
];

export function HelpDialog() {
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then((v: string) => setAppVersion(v || ''));
  }, []);

  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <HelpCircle className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{'도움말'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{'도움말'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="text-center py-4">
            <h3 className="text-xl font-bold">Gmail Desktop</h3>
            <p className="text-muted-foreground mt-1">{'버전 '}{appVersion || '...'}</p>
            <p className="text-xs text-muted-foreground mt-1">Electron + React + TypeScript</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <Keyboard className="h-4 w-4" />
              {'단축키'}
            </h4>
            <div className="space-y-1.5">
              {shortcuts.map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.desc}</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{'Gmail Desktop는 여러 Gmail 계정을 하나의 화면에서 관리할 수 있는 데스크톱 이메일 클라이언트입니다.'}</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs mt-2">
              <li>{'최대 4개의 Gmail 계정 동시 관리'}</li>
              <li>{'Google Calendar 연동'}</li>
              <li>{'Google Tasks 연동'}</li>
              <li>{'AI 메일 도우미 (Ollama)'}</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
