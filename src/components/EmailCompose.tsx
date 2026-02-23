import { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useEmailsStore } from '@/stores/emails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ContactInput } from './ContactInput';
import type { EmailDraft } from '@/types';

interface EmailComposeProps {
  onClose: () => void;
}

export function EmailCompose({ onClose }: EmailComposeProps) {
  const { currentAccountId } = useAccountsStore();
  const { sendEmail, isLoading } = useEmailsStore();

  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccountId || !to.trim()) return;

    const draft: EmailDraft = {
      to: to.split(',').map((email) => email.trim()),
      cc: cc ? cc.split(',').map((email) => email.trim()) : undefined,
      subject,
      body,
    };

    try {
      await sendEmail(currentAccountId, draft);
      onClose();
    } catch (error) {
      console.error('Failed to send email:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background w-full max-w-2xl rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">새 메일</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 space-y-3 border-b">
            <div className="flex items-center gap-2">
              <label className="w-16 text-sm text-muted-foreground">받는 사람</label>
              <ContactInput
                value={to}
                onChange={setTo}
                placeholder="이메일 주소 (쉼표로 구분)"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-16 text-sm text-muted-foreground">참조</label>
              <ContactInput
                value={cc}
                onChange={setCc}
                placeholder="참조 (선택)"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-16 text-sm text-muted-foreground">제목</label>
              <Input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="제목"
              />
            </div>
          </div>

          <div className="flex-1 p-4 min-h-0">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="내용을 입력하세요..."
              className="h-full min-h-[200px] resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-xs text-muted-foreground">
              {currentAccountId && `발신: ${useAccountsStore.getState().accounts.find((a) => a.id === currentAccountId)?.email}`}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" disabled={isLoading || !to.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                보내기
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
