import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EmailDraft } from '@/types';

interface EmailPreviewDialogProps {
  draft: EmailDraft | null;
  open: boolean;
  onClose: () => void;
}

export function EmailPreviewDialog({ draft, open, onClose }: EmailPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{'보내는 메일 미리보기'}</DialogTitle>
        </DialogHeader>
        {draft && (
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">{'받는 사람: '}</span>
              <span>{draft.to.join(', ') || '(없음)'}</span>
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
                  {'첨부파일: '}
                  {draft.attachments.map((a) => a.filename).join(', ')}
                </span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
