import { useState, useEffect } from 'react';
import { X, Send, Eye, Loader2 } from 'lucide-react';
import { useSendQueueStore } from '@/stores/send-queue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EmailDraft } from '@/types';

const SEND_DELAY_MS = 60_000;

function PreviewDialog({ draft, open, onClose }: { draft: EmailDraft; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{'보내는 메일 미리보기'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">{'받는 사람: '}</span>
            <span>{draft.to.join(', ')}</span>
          </div>
          {draft.cc && draft.cc.length > 0 && (
            <div>
              <span className="text-muted-foreground">{'참조: '}</span>
              <span>{draft.cc.join(', ')}</span>
            </div>
          )}
          {draft.bcc && draft.bcc.length > 0 && (
            <div>
              <span className="text-muted-foreground">{'숨은참조: '}</span>
              <span>{draft.bcc.join(', ')}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">{'제목: '}</span>
            <span className="font-medium">{draft.subject || '(제목 없음)'}</span>
          </div>
          <div className="border-t pt-3">
            {draft.isHtml ? (
              <div
                className="email-content prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: draft.body }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans">{draft.body}</pre>
            )}
          </div>
          {draft.attachments && draft.attachments.length > 0 && (
            <div className="border-t pt-2">
              <span className="text-muted-foreground text-xs">
                {'첨부파일: '}{draft.attachments.map((a) => a.filename).join(', ')}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QueueItem({ id, queuedAt, draft, sending }: { id: string; queuedAt: number; draft: EmailDraft; sending: boolean }) {
  const cancel = useSendQueueStore((s) => s.cancel);
  const sendNow = useSendQueueStore((s) => s.sendNow);
  const [remaining, setRemaining] = useState(() => Math.max(0, SEND_DELAY_MS - (Date.now() - queuedAt)));
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const r = Math.max(0, SEND_DELAY_MS - (Date.now() - queuedAt));
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [queuedAt]);

  const seconds = Math.ceil(remaining / 1000);

  return (
    <>
      <div className="flex items-center gap-2 bg-background border rounded-lg shadow-lg px-4 py-2.5 min-w-[400px] max-w-[600px]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          ) : (
            <Send className="h-4 w-4 text-blue-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {sending ? '전송 중...' : `${seconds}초 후 전송`}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {draft.to.join(', ')}{draft.subject ? ` - ${draft.subject}` : ''}
            </div>
          </div>
        </div>
        {!sending && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="h-3 w-3 mr-1" />
              {'미리보기'}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2"
              onClick={() => sendNow(id)}
            >
              <Send className="h-3 w-3 mr-1" />
              {'즉시 보내기'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2"
              onClick={() => cancel(id)}
            >
              <X className="h-3 w-3 mr-1" />
              {'취소'}
            </Button>
          </div>
        )}
      </div>
      <PreviewDialog draft={draft} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </>
  );
}

export function SendQueue() {
  const queue = useSendQueueStore((s) => s.queue);

  if (queue.length === 0) return null;

  return (
    <div className="fixed top-1 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2">
      {queue.map((item) => (
        <QueueItem
          key={item.id}
          id={item.id}
          queuedAt={item.queuedAt}
          draft={item.draft}
          sending={item.sending}
        />
      ))}
    </div>
  );
}
