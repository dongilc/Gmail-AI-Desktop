import { useState, useRef, useEffect, memo, useCallback, startTransition } from 'react';
import { Reply, ReplyAll, Forward, Star, AlertCircle, Trash2, ShieldAlert, ListPlus, Loader2, Send, X, Paperclip, Image, Download, FileText, FileImage, FileArchive, File, Eye, Printer, FileDown, Sun, Moon, Sparkles, Languages } from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useEmailsStore } from '@/stores/emails';
import { shallow } from 'zustand/shallow';
import { useTasksStore } from '@/stores/tasks';
import { usePreferencesStore } from '@/stores/preferences';
import { useAiStore } from '@/stores/ai';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Resizer } from './ui/resizer';
import { PdfViewer } from './PdfViewer';
import { ContactInput } from './ContactInput';
import {
  formatFullDate,
  formatTime,
  cn,
  stripHtml,
  getSenderDisplayName,
  getSenderEmailAddress,
  formatAddressLabel,
} from '@/lib/utils';
import type { EmailDraft, EmailAttachment } from '@/types';

const ADDRESS_COLLAPSE_THRESHOLD = 10;

function CollapsibleAddressList({
  label,
  addresses,
  className,
}: {
  label: string;
  addresses: { name?: string; email: string }[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = addresses.length > ADDRESS_COLLAPSE_THRESHOLD;
  const visibleAddresses = shouldCollapse && !expanded
    ? addresses.slice(0, ADDRESS_COLLAPSE_THRESHOLD)
    : addresses;
  const hiddenCount = addresses.length - ADDRESS_COLLAPSE_THRESHOLD;

  return (
    <div className={cn('text-xs text-muted-foreground', className)}>
      {label}: {visibleAddresses.map((t) => formatAddressLabel(t.name, t.email)).join(', ')}
      {shouldCollapse && !expanded && (
        <button
          type="button"
          className="ml-1 text-blue-400 hover:text-blue-300 hover:underline"
          onClick={() => setExpanded(true)}
        >
          ...외 {hiddenCount}명 더보기
        </button>
      )}
      {shouldCollapse && expanded && (
        <button
          type="button"
          className="ml-1 text-blue-400 hover:text-blue-300 hover:underline"
          onClick={() => setExpanded(false)}
        >
          접기
        </button>
      )}
    </div>
  );
}

function EmailViewComponent() {
  const { currentAccountId, accounts } = useAccountsStore();
  const {
    selectedEmail,
    toggleStar,
    toggleImportant,
    trashEmail,
    markAsSpam,
    removeEmail,
    sendEmail,
    markAsRead,
    currentView,
    isComposing,
    setComposing,
    composeTo,
  } = useEmailsStore(
    (state) => ({
      selectedEmail: state.selectedEmail,
      toggleStar: state.toggleStar,
      toggleImportant: state.toggleImportant,
      trashEmail: state.trashEmail,
      markAsSpam: state.markAsSpam,
      removeEmail: state.removeEmail,
      sendEmail: state.sendEmail,
      markAsRead: state.markAsRead,
      currentView: state.currentView,
      isComposing: state.isComposing,
      setComposing: state.setComposing,
      composeTo: state.composeTo,
    }),
    shallow
  );
  const { openQuickAdd } = useTasksStore();
  const { emailBodyAdjustLevel, setEmailBodyAdjustLevel } = usePreferencesStore();
  const { addTokens, incrementPending, decrementPending, addCompleted } = useAiStore();

  // 인라인 답장/전달 상태
  const [isReplying, setIsReplying] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [, setIsDraftSaving] = useState(false);

  // 답장 창 높이 (퍼센트)
  const [replyHeight, setReplyHeight] = useState(60);

  // 답장/전달 폼 데이터
  const [replyTo, setReplyTo] = useState('');
  const [replyCc, setReplyCc] = useState('');
  const [replyBcc, setReplyBcc] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const draftTimerRef = useRef<number | null>(null);
  const saveDraftNowRef = useRef<(() => void) | null>(null);
  const lastDraftKeyRef = useRef<string>('');
  const initialDraftKeyRef = useRef<string>('');
  const replyQuoteRef = useRef<string>('');
  const [isAiReplying, setIsAiReplying] = useState(false);
  const [isAiProofing, setIsAiProofing] = useState(false);
  const [proofreadTone, setProofreadTone] = useState<'formal' | 'casual'>('formal');
  const [proofreadIncludeSubject, setProofreadIncludeSubject] = useState(false);
  const [proofreadLanguage, setProofreadLanguage] = useState<'auto' | 'ko' | 'en' | 'ja' | 'zh'>('auto');
  const [showProofreadCompare, setShowProofreadCompare] = useState(false);
  const [proofreadBefore, setProofreadBefore] = useState<{ subject: string; body: string } | null>(null);
  const [proofreadAfter, setProofreadAfter] = useState<{ subject: string; body: string } | null>(null);
  const [translatedBody, setTranslatedBody] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const translationCacheRef = useRef<Map<string, string>>(new Map());
  const bodyCacheRef = useRef<
    Map<
      string,
      {
        bodyHtml: string;
        body: string;
        snippet: string;
        processedHtml: string;
        plainTextBody: string;
        plainTextPreview: string;
      }
    >
  >(new Map());
  const processedHtmlSourceRef = useRef<'cache' | 'fresh' | 'none'>('none');
  const MAX_BODY_CACHE = 50;

  // 파일 입력 refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 드래그 앤 드롭 상태
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  // 첨부파일 미리보기 상태
  const [attachmentPreview, setAttachmentPreview] = useState<{
    file: File;
    url: string;
    data?: string; // base64 data for PDF
    type: 'image' | 'pdf' | 'other';
  } | null>(null);

  // 인라인 이미지 상태
  const [inlineImages, setInlineImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState(false);
  const loadingEmailIdRef = useRef<string | null>(null);
  const loadedImagesRef = useRef<Record<string, Record<string, string>>>({});
  const inlineImageIdleRef = useRef<number | null>(null);
  const cancelInlineImageIdle = useCallback(() => {
    if (inlineImageIdleRef.current === null) return;
    const cancelIdle = (window as any).cancelIdleCallback as ((id: number) => void) | undefined;
    if (cancelIdle) {
      cancelIdle(inlineImageIdleRef.current);
    } else {
      window.clearTimeout(inlineImageIdleRef.current);
    }
    inlineImageIdleRef.current = null;
  }, []);

  const scheduleInlineImageApply = useCallback(
    (images: Record<string, string>, emailId: string) => {
      cancelInlineImageIdle();
      const apply = () => {
        if (loadingEmailIdRef.current !== emailId) return;
        startTransition(() => {
          setInlineImages(images);
        });
        setLoadingImages(false);
      };
      const requestIdle = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout?: number }) => number)
        | undefined;
      if (requestIdle) {
        inlineImageIdleRef.current = requestIdle(apply, { timeout: 2500 });
      } else {
        inlineImageIdleRef.current = window.setTimeout(apply, 500);
      }
    },
    [cancelInlineImageIdle]
  );

  useEffect(() => {
    return () => {
      cancelInlineImageIdle();
    };
  }, [cancelInlineImageIdle]);

  // PDF 미리보기 상태
  const [pdfPreview, setPdfPreview] = useState<{ data: string; filename: string } | null>(null);
  const [hwpPreview, setHwpPreview] = useState<{ html: string; filename: string } | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // 본문이 아직 로딩 중인지 확인
  const isBodyLoading = selectedEmail && !selectedEmail.body && !selectedEmail.bodyHtml;

  // 선택된 이메일 ID
  const selectedEmailId = selectedEmail?.id;
  const isDraftEmail = Boolean(selectedEmail && (currentView === 'drafts' || selectedEmail.labels?.includes('DRAFT')));
  const isComposeOnly = isComposing && !selectedEmail;

  // 다른 이메일 선택 시 답장/전달 창 닫기
  useEffect(() => {
    // 이메일이 바뀌면 답장/전달 상태 초기화
    setIsReplying(false);
    setIsForwarding(false);
    setReplyTo('');
    setReplyCc('');
    setReplyBcc('');
    setReplySubject('');
    setReplyBody('');
    setAttachedFiles([]);
    setDraftId(selectedEmail?.draftId || null);
    lastDraftKeyRef.current = '';
    initialDraftKeyRef.current = '';
    replyQuoteRef.current = '';
    setIsAiReplying(false);
    setProofreadBefore(null);
    setProofreadAfter(null);
    setShowProofreadCompare(false);
    setTranslatedBody('');
    setShowTranslated(false);
    setIsTranslating(false);

    if (selectedEmail && isDraftEmail) {
      const toValue = selectedEmail.to?.map((t) => t.email).join(', ') || '';
      const ccValue = selectedEmail.cc?.map((t) => t.email).join(', ') || '';
      const bccValue = selectedEmail.bcc?.map((t) => t.email).join(', ') || '';
      const subjectValue = selectedEmail.subject || '';
      const bodyValue = selectedEmail.body || '';
      setReplyTo(toValue);
      setReplyCc(ccValue);
      setReplyBcc(bccValue);
      setReplySubject(subjectValue);
      setReplyBody(bodyValue);
      initialDraftKeyRef.current = buildDraftKey(
        sanitizeAddresses(toValue),
        sanitizeAddresses(ccValue),
        subjectValue.trim(),
        bodyValue,
        []
      );
    }
  }, [selectedEmailId, isDraftEmail]);

  // draft 본문이 뒤늦게 로드되면 편집 폼 갱신
  const draftBodyLoaded = isDraftEmail && selectedEmail?.body;
  useEffect(() => {
    if (!isDraftEmail || !selectedEmail?.body) return;
    // body가 비어있을 때만 갱신 (사용자가 이미 편집한 경우 덮어쓰지 않음)
    if (replyBody !== '') return;
    const toValue = selectedEmail.to?.map((t) => t.email).join(', ') || '';
    const ccValue = selectedEmail.cc?.map((t) => t.email).join(', ') || '';
    const subjectValue = selectedEmail.subject || '';
    const bodyValue = selectedEmail.body;
    setReplyBody(bodyValue);
    initialDraftKeyRef.current = buildDraftKey(
      sanitizeAddresses(toValue),
      sanitizeAddresses(ccValue),
      subjectValue.trim(),
      bodyValue,
      []
    );
  }, [draftBodyLoaded]);

  useEffect(() => {
    if (!isComposeOnly) return;
    setReplyTo(composeTo || '');
    setReplyCc('');
    setReplyBcc('');
    setReplySubject('');
    setReplyBody('');
    setAttachedFiles([]);
    setDraftId(null);
    lastDraftKeyRef.current = '';
    initialDraftKeyRef.current = '';
    replyQuoteRef.current = '';
    setIsAiProofing(false);
    setProofreadBefore(null);
    setProofreadAfter(null);
    setShowProofreadCompare(false);
    setTranslatedBody('');
    setShowTranslated(false);
    setIsTranslating(false);
  }, [isComposeOnly]);

  // 3초 후 자동 읽음 처리
  useEffect(() => {
    if (!selectedEmail || !currentAccountId) return;
    if (selectedEmail.isRead) return;

    const timer = setTimeout(() => {
      // 타이머가 끝났을 때 최신 상태 확인
      const currentManualSet = useEmailsStore.getState().manuallyMarkedUnread;
      if (currentManualSet.has(selectedEmail.id)) return;
      markAsRead(currentAccountId, selectedEmail.id);
    }, 3000);

    return () => clearTimeout(timer);
  }, [selectedEmailId, selectedEmail?.isRead, currentAccountId, markAsRead]);

  // 이미지 첨부파일 자동 로딩
  useEffect(() => {
    if (!selectedEmailId || !currentAccountId || !selectedEmail) {
      return;
    }

    loadingEmailIdRef.current = selectedEmailId;

    if (loadedImagesRef.current[selectedEmailId]) {
      scheduleInlineImageApply(loadedImagesRef.current[selectedEmailId], selectedEmailId);
      return;
    }

    if (loadingEmailIdRef.current === selectedEmailId && loadingImages) {
      return;
    }

    const imageAttachments =
      selectedEmail.attachments?.filter((att) => att.mimeType.startsWith('image/')) || [];

    if (imageAttachments.length === 0) {
      setInlineImages({});
      setLoadingImages(false);
      return;
    }

    const loadImages = async () => {
      setLoadingImages(true);
      const loaded: Record<string, string> = {};

      await Promise.all(
        imageAttachments.map(async (att) => {
          try {
            const result = await window.electronAPI.getAttachment(
              currentAccountId,
              selectedEmailId,
              att.id
            );
            loaded[att.id] = `data:${att.mimeType};base64,${result.data}`;
          } catch (error) {
            console.error('Failed to load image:', att.filename, error);
          }
        })
      );

      loadedImagesRef.current[selectedEmailId] = loaded;
      if (loadingEmailIdRef.current === selectedEmailId) {
        scheduleInlineImageApply(loaded, selectedEmailId);
      }
    };

    loadImages();
  }, [
    currentAccountId,
    loadingImages,
    scheduleInlineImageApply,
    selectedEmail,
    selectedEmailId,
  ]);

  // 이메일이 바뀌면 캐시에서 이미지 가져오기




  const handleToggleStar = () => {
    if (currentAccountId && selectedEmail) {
      toggleStar(currentAccountId, selectedEmail.id);
    }
  };

  const handleToggleImportant = () => {
    if (currentAccountId && selectedEmail) {
      toggleImportant(currentAccountId, selectedEmail.id);
    }
  };

  const handleTrash = () => {
    if (currentAccountId && selectedEmail) {
      trashEmail(currentAccountId, selectedEmail.id);
    }
  };

  const handleMarkSpam = () => {
    if (currentAccountId && selectedEmail) {
      markAsSpam(currentAccountId, selectedEmail.id);
    }
  };

  const handleAddTodo = () => {
    openQuickAdd(selectedEmail ?? undefined);
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const processEmailHtml = (html: string) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Remove styles/scripts that might alter layout.
      doc.querySelectorAll('style, link[rel="stylesheet"], script, base, meta').forEach((el) => el.remove());

      return doc.body?.innerHTML || '';
    } catch {
      return html;
    }
  };

  const quickStripHtml = (html: string) =>
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<link[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<base[^>]*>/gi, '');

  const getEmailPlainText = () => {
    if (!selectedEmail) return '';
    if (selectedEmail.bodyHtml && plainTextBody) return plainTextBody;
    if (selectedEmail.body && selectedEmail.body.trim()) return selectedEmail.body;
    return '';
  };

  const [processedHtml, setProcessedHtml] = useState('');
  const [plainTextPreview, setPlainTextPreview] = useState('');
  const [plainTextBody, setPlainTextBody] = useState('');

  useEffect(() => {
    if (!selectedEmail) {
      processedHtmlSourceRef.current = 'none';
      setProcessedHtml('');
      setPlainTextPreview('');
      setPlainTextBody('');
      return;
    }
    const key = selectedEmail.id;
    const bodyHtml = selectedEmail.bodyHtml || '';
    const body = selectedEmail.body || '';
    const snippet = selectedEmail.snippet || '';
    const cached = bodyCacheRef.current.get(key);
    if (
      cached &&
      cached.bodyHtml === bodyHtml &&
      cached.body === body &&
      cached.snippet === snippet
    ) {
      processedHtmlSourceRef.current = 'cache';
      bodyCacheRef.current.delete(key);
      bodyCacheRef.current.set(key, cached);
      setProcessedHtml(cached.processedHtml);
      setPlainTextBody(cached.plainTextBody);
      setPlainTextPreview(cached.plainTextPreview);
      return;
    }

    processedHtmlSourceRef.current = 'fresh';
    let nextProcessedHtml = '';
    if (bodyHtml) {
      const quick = quickStripHtml(bodyHtml);
      nextProcessedHtml = bodyHtml.length > 60000 ? quick : processEmailHtml(quick);
    }
    const nextPlainTextBody = bodyHtml ? stripHtml(nextProcessedHtml) : body;
    let nextPreview = '';
    if (body && body.trim()) {
      nextPreview = body;
    } else if (snippet && snippet.trim()) {
      nextPreview = snippet;
    } else if (bodyHtml) {
      nextPreview = bodyHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    setProcessedHtml(nextProcessedHtml);
    setPlainTextBody(nextPlainTextBody);
    setPlainTextPreview(nextPreview);
    bodyCacheRef.current.set(key, {
      bodyHtml,
      body,
      snippet,
      processedHtml: nextProcessedHtml,
      plainTextBody: nextPlainTextBody,
      plainTextPreview: nextPreview,
    });
    if (bodyCacheRef.current.size > MAX_BODY_CACHE) {
      const oldestKey = bodyCacheRef.current.keys().next().value;
      if (oldestKey) bodyCacheRef.current.delete(oldestKey);
    }
  }, [selectedEmail?.id, selectedEmail?.bodyHtml, selectedEmail?.body, selectedEmail?.snippet]);

  const [deferredHtml, setDeferredHtml] = useState('');

  useEffect(() => {
    if (!selectedEmail?.bodyHtml) {
      setDeferredHtml('');
      return;
    }
    setDeferredHtml('');
    if (!processedHtml) return;
    if (processedHtmlSourceRef.current === 'cache') {
      setDeferredHtml(processedHtml);
      return;
    }
    const nextHtml = processedHtml;
    const schedule = (cb: () => void) => {
      const idle = (window as any).requestIdleCallback as
        | ((fn: () => void) => number)
        | undefined;
      if (idle) {
        const id = idle(cb);
        return () => (window as any).cancelIdleCallback?.(id);
      }
      const id = window.setTimeout(cb, 0);
      return () => window.clearTimeout(id);
    };
    const cancel = schedule(() => {
      setDeferredHtml(nextHtml);
    });
    return cancel;
  }, [selectedEmail?.id, selectedEmail?.bodyHtml, processedHtml]);


  const buildPrintableHtml = () => {
    if (!selectedEmail) return '';
    const subject = escapeHtml(selectedEmail.subject || '');
    const from = escapeHtml(
      getSenderDisplayName(selectedEmail.from.name, selectedEmail.from.email)
    );
    const fromEmail = escapeHtml(getSenderEmailAddress(selectedEmail.from.email));
    const toLine = escapeHtml(
      selectedEmail.to.map((t) => formatAddressLabel(t.name, t.email)).join(', ')
    );
    const dateLine = escapeHtml(formatFullDate(new Date(selectedEmail.date)));
    const timeLine = escapeHtml(formatTime(new Date(selectedEmail.date)));
    const bodyHtml = selectedEmail.bodyHtml
      ? processedHtml
      : `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(selectedEmail.body || selectedEmail.snippet || '')}</pre>`;

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${subject || 'Email'}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; margin: 32px; }
      h1 { font-size: 20px; margin: 0 0 12px; }
      .meta { font-size: 12px; color: #444; margin-bottom: 16px; }
      .meta div { margin-bottom: 4px; }
      hr { border: 0; border-top: 1px solid #ddd; margin: 16px 0; }
      img { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>
    <h1>${subject}</h1>
    <div class="meta">
      <div>From: ${from} &lt;${fromEmail}&gt;</div>
      <div>To: ${toLine}</div>
      <div>Date: ${dateLine} ${timeLine}</div>
    </div>
    <hr />
    <div class="content">${bodyHtml}</div>
  </body>
</html>`;
  };

  const handlePrint = async () => {
    try {
      await window.electronAPI.printHtml(buildPrintableHtml());
    } catch (error) {
      console.error('Failed to print:', error);
    }
  };

  const handlePrintToPdf = async () => {
    if (!selectedEmail) return;
    try {
      const filename = selectedEmail.subject
        ? selectedEmail.subject.replace(/[\\/:*?"<>|]+/g, '_')
        : 'email';
      await window.electronAPI.printToPdf(buildPrintableHtml(), filename);
    } catch (error) {
      console.error('Failed to export PDF:', error);
    }
  };

  const handleStartReply = () => {
    if (!selectedEmail) return;
    const nextTo = getSenderEmailAddress(selectedEmail.from.email);
    const nextCc = '';
    const nextSubject = `Re: ${selectedEmail.subject}`;
    const nextBody = `\n\n${new Date(selectedEmail.date).toLocaleString()} ${getSenderDisplayName(
      selectedEmail.from.name,
      selectedEmail.from.email
    )} \uC791\uC131:\n> ${(selectedEmail.body || selectedEmail.snippet).split('\n').join('\n> ')}`;
    setReplyTo(nextTo);
    setReplyCc(nextCc);
    setReplySubject(nextSubject);
    setReplyBody(nextBody);
    setIsReplying(true);
    setIsForwarding(false);
    replyQuoteRef.current = nextBody;
    initialDraftKeyRef.current = buildDraftKey(
      sanitizeAddresses(nextTo),
      sanitizeAddresses(nextCc),
      nextSubject.trim(),
      nextBody,
      []
    );
  };

  const handleStartReplyAll = () => {
    if (!selectedEmail) return;
    const currentEmail =
      accounts.find((account) => account.id === currentAccountId)?.email?.toLowerCase() || '';
    const normalize = (value: string) => value.trim().toLowerCase();
    const isSelf = (value: string) => currentEmail && normalize(value) === currentEmail;
    const toSet = new Set<string>();
    const ccSet = new Set<string>();

    const addAddress = (set: Set<string>, value?: string) => {
      if (!value) return;
      const cleaned = value.trim();
      if (!cleaned) return;
      if (isSelf(cleaned)) return;
      set.add(cleaned);
    };

    addAddress(toSet, getSenderEmailAddress(selectedEmail.from.email));
    selectedEmail.to?.forEach((item) => addAddress(toSet, item.email));
    selectedEmail.cc?.forEach((item) => addAddress(ccSet, item.email));
    toSet.forEach((email) => ccSet.delete(email));

    const nextTo = Array.from(toSet).join(', ');
    const nextCc = Array.from(ccSet).join(', ');
    const subject = selectedEmail.subject || '';
    const nextSubject = subject.trim().toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
    const nextBody = `\n\n${new Date(selectedEmail.date).toLocaleString()} ${getSenderDisplayName(
      selectedEmail.from.name,
      selectedEmail.from.email
    )} \uC791\uC131:\n> ${(selectedEmail.body || selectedEmail.snippet).split('\n').join('\n> ')}`;

    setReplyTo(nextTo);
    setReplyCc(nextCc);
    setReplySubject(nextSubject);
    setReplyBody(nextBody);
    setIsReplying(true);
    setIsForwarding(false);
    replyQuoteRef.current = nextBody;
    initialDraftKeyRef.current = buildDraftKey(
      sanitizeAddresses(nextTo),
      sanitizeAddresses(nextCc),
      nextSubject.trim(),
      nextBody,
      []
    );
  };

  const handleStartForward = () => {
    if (!selectedEmail) return;
    const nextTo = '';
    const nextCc = '';
    const nextSubject = `Fwd: ${selectedEmail.subject}`;
    const nextBody = `\n\n---------- \uC804\uB2EC\uB41C \uBA54\uC2DC\uC9C0 ----------\n\uBCF4\uB0B8 \uC0AC\uB78C: ${getSenderDisplayName(
      selectedEmail.from.name,
      selectedEmail.from.email
    )}\n\uB0A0\uC9DC: ${new Date(selectedEmail.date).toLocaleString()}\n\uC81C\uBAA9: ${
      selectedEmail.subject
    }\n\uBC1B\uB294 \uC0AC\uB78C: ${selectedEmail.to
      .map((t) => formatAddressLabel(t.name, t.email))
      .join(', ')}\n\n${selectedEmail.body || selectedEmail.snippet}`;
    setReplyTo(nextTo);
    setReplyCc(nextCc);
    setReplySubject(nextSubject);
    setReplyBody(nextBody);
    setIsReplying(false);
    setIsForwarding(true);
    replyQuoteRef.current = nextBody;
    initialDraftKeyRef.current = buildDraftKey(
      sanitizeAddresses(nextTo),
      sanitizeAddresses(nextCc),
      nextSubject.trim(),
      nextBody,
      []
    );
  };

  const handleCancelReply = () => {
    if (isComposeOnly) {
      setComposing(false);
      setReplyTo('');
      setReplyCc('');
      setReplyBcc('');
      setReplySubject('');
      setReplyBody('');
      setAttachedFiles([]);
      setDraftId(null);
      lastDraftKeyRef.current = '';
      initialDraftKeyRef.current = '';
      replyQuoteRef.current = '';
      setIsAiReplying(false);
      setIsAiProofing(false);
      setProofreadBefore(null);
      setProofreadAfter(null);
      setShowProofreadCompare(false);
      return;
    }
    if (isDraftEmail && selectedEmail) {
      const toValue = selectedEmail.to?.map((t) => t.email).join(', ') || '';
      const ccValue = selectedEmail.cc?.map((t) => t.email).join(', ') || '';
      const bccValue = selectedEmail.bcc?.map((t) => t.email).join(', ') || '';
      const subjectValue = selectedEmail.subject || '';
      const bodyValue = selectedEmail.body || '';
      setReplyTo(toValue);
      setReplyCc(ccValue);
      setReplyBcc(bccValue);
      setReplySubject(subjectValue);
      setReplyBody(bodyValue);
      setAttachedFiles([]);
      replyQuoteRef.current = '';
      initialDraftKeyRef.current = buildDraftKey(
        sanitizeAddresses(toValue),
        sanitizeAddresses(ccValue),
        subjectValue.trim(),
        bodyValue,
        []
      );
      setIsAiReplying(false);
      setIsAiProofing(false);
      setProofreadBefore(null);
      setProofreadAfter(null);
      setShowProofreadCompare(false);
      return;
    }
    setIsReplying(false);
    setIsForwarding(false);
    setReplyTo('');
    setReplyCc('');
    setReplyBcc('');
    setReplySubject('');
    setReplyBody('');
    setAttachedFiles([]);
    setIsAiReplying(false);
    replyQuoteRef.current = '';
    initialDraftKeyRef.current = '';
    setProofreadBefore(null);
    setProofreadAfter(null);
    setShowProofreadCompare(false);
  };

  const buildAiReplyPrompt = () => {
    if (!selectedEmail) return '';
    const fromName = getSenderDisplayName(selectedEmail.from.name, selectedEmail.from.email);
    const fromEmail = getSenderEmailAddress(selectedEmail.from.email);
    const subject = selectedEmail.subject || '';
    const body = selectedEmail.body || selectedEmail.snippet || '';
    return [
      'You are an assistant drafting an email reply.',
      'Write in the same language as the original email. If unclear, use Korean.',
      'Keep it concise and professional.',
      'Return only the reply body. Do not include subject lines or quoted original text.',
      '',
      `From: ${fromName} <${fromEmail}>`,
      `Subject: ${subject}`,
      'Email:',
      body,
    ].join('\n');
  };

  const handleGenerateReply = async () => {
    if (!window.electronAPI?.aiGenerate || !selectedEmail) return;
    setIsAiReplying(true);
    incrementPending();
    try {
      const prompt = buildAiReplyPrompt();
      const result = await window.electronAPI.aiGenerate({ prompt });
      const draftText = result?.text?.trim() || '';
      if (!draftText) {
        setIsAiReplying(false);
        return;
      }

      const quote = replyQuoteRef.current.trim();
      if (quote && replyBody.includes(quote)) {
        const before = replyBody.slice(0, replyBody.indexOf(quote)).trim();
        const combinedBefore = before ? `${draftText}\n\n${before}` : draftText;
        setReplyBody(`${combinedBefore}\n\n${quote}`);
      } else if (replyBody.trim()) {
        setReplyBody(`${draftText}\n\n${replyBody.trim()}`);
      } else {
        setReplyBody(draftText);
      }

      addTokens(result?.promptTokens || 0, result?.evalTokens || 0);
    } catch (error) {
      console.error('Failed to generate reply draft:', error);
    } finally {
      decrementPending();
      addCompleted();
      setIsAiReplying(false);
    }
  };

  const buildProofreadPrompt = (
    body: string,
    subject: string,
    tone: 'formal' | 'casual',
    includeSubject: boolean,
    language: 'auto' | 'ko' | 'en' | 'ja' | 'zh'
  ) => {
    const toneLine =
      tone === 'casual'
        ? 'Use a friendly, casual tone while remaining respectful.'
        : 'Use a formal, professional tone.';
    const languageLine =
      language === 'auto'
        ? 'Do not translate. Preserve the original language(s) exactly.'
        : `Write the revised email in ${language === 'ko'
          ? 'Korean'
          : language === 'en'
            ? 'English'
            : language === 'ja'
              ? 'Japanese'
              : 'Chinese'}. Translation is allowed only to match the selected language.`;
    if (includeSubject) {
      return [
        'You are a professional writing assistant.',
        'Improve grammar, clarity, and tone of the following email draft.',
        'Keep the original meaning.',
        'Do not add new information.',
        'Do not add any preface or commentary (e.g., "Here is the revised email body").',
        toneLine,
        languageLine,
        'Revise both the subject and body.',
        'Return the result in the exact format below:',
        'SUBJECT: <one line>',
        'BODY:',
        '<revised body>',
        '',
        'INPUT:',
        `Subject: ${subject || ''}`,
        'Body:',
        body,
      ].join('\n');
    }
    return [
      'You are a professional writing assistant.',
      'Improve grammar, clarity, and tone of the following email draft.',
      'Keep the original meaning.',
      'Do not add new information.',
      'Do not add any preface or commentary (e.g., "Here is the revised email body").',
      toneLine,
      languageLine,
      'Return only the revised email body. Do not include subject lines, labels, or extra commentary.',
      '',
      body,
    ].join('\n');
  };

  const parseProofreadResult = (text: string) => {
    const subjectMatch = text.match(/^\s*(SUBJECT|\uC81C\uBAA9)\s*:\s*(.+)$/im);
    const bodyMatch = text.match(/^\s*(BODY|\uBCF8\uBB38)\s*:\s*([\s\S]+)$/im);
    if (!subjectMatch && !bodyMatch) return null;
    const subject = subjectMatch?.[2]?.trim() || '';
    let body = bodyMatch?.[2]?.trim() || '';
    if (!body && subjectMatch) {
      body = text.replace(subjectMatch[0], '').trim();
    }
    return { subject, body };
  };

  const stripBodyLabel = (text: string) =>
    text.replace(/^\s*(BODY|\uBCF8\uBB38|\uB0B4\uC6A9)\s*:\s*/i, '').trim();

  const stripProofreadPreamble = (text: string) => {
    if (!text) return text;
    const lines = text.split(/\r?\n/);
    while (lines.length && lines[0].trim() === '') {
      lines.shift();
    }
    const first = lines[0]?.trim() || '';
    const prefacePatterns = [
      /^Here is (the )?revised email body:?\s*$/i,
      /^Here is (the )?revised email:?\s*$/i,
      /^Below is (the )?revised email body:?\s*$/i,
      /^Revised email body:?\s*$/i,
      /^Revised email:?\s*$/i,
      /^Here is the revised version:?\s*$/i,
      /^Revised version:?\s*$/i,
      /^\uAD50\uC815(\uB41C)? (\uC774\uBA54\uC77C )?\uBCF8\uBB38(\uC740)?( \uB2E4\uC74C\uACFC \uAC19\uC2B5\uB2C8\uB2E4)?\.?\s*$/,
      /^\uC218\uC815(\uB41C)? (\uC774\uBA54\uC77C )?\uBCF8\uBB38(\uC740)?( \uB2E4\uC74C\uACFC \uAC19\uC2B5\uB2C8\uB2E4)?\.?\s*$/,
      /^\uB2E4\uC74C\uC740 (\uAD50\uC815|\uC218\uC815)\uB41C (\uC774\uBA54\uC77C )?\uBCF8\uBB38(\uC785\uB2C8\uB2E4)?\.?\s*$/,
    ];
    if (prefacePatterns.some((pattern) => pattern.test(first))) {
      lines.shift();
      while (lines.length && lines[0].trim() === '') {
        lines.shift();
      }
    }
    return lines.join('\n').trim();
  };

  const stripTranslatePreamble = (text: string) => {
    if (!text) return text;
    const lines = text.split(/\r?\n/);
    while (lines.length && lines[0].trim() === '') {
      lines.shift();
    }
    const first = lines[0]?.trim() || '';
    const prefacePatterns = [
      /^Here is (the )?translation:?\s*$/i,
      /^Translation:?\s*$/i,
      /^Translated text:?\s*$/i,
      /^Below is (the )?translation:?\s*$/i,
      /^\uBC88\uC5ED(\uB41C)? (\uB0B4\uC6A9|\uBCF8\uBB38)(\uC740)?( \uB2E4\uC74C\uACFC \uAC19\uC2B5\uB2C8\uB2E4)?\.?\s*$/,
      /^\uB2E4\uC74C\uC740 \uBC88\uC5ED(\uB41C)? (\uB0B4\uC6A9|\uBCF8\uBB38)(\uC785\uB2C8\uB2E4)?\.?\s*$/,
    ];
    if (prefacePatterns.some((pattern) => pattern.test(first))) {
      lines.shift();
      while (lines.length && lines[0].trim() === '') {
        lines.shift();
      }
    }
    return lines.join('\n').trim();
  };

  const detectLanguageLabel = (text: string) => {
    if (!text) return null;
    let ko = 0;
    let ja = 0;
    let zh = 0;
    let en = 0;
    const maxScan = Math.min(text.length, 4000);
    for (let i = 0; i < maxScan; i += 1) {
      const code = text.charCodeAt(i);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        ko += 1;
      } else if ((code >= 0x3040 && code <= 0x30FF) || (code >= 0x31F0 && code <= 0x31FF)) {
        ja += 1;
      } else if (code >= 0x4E00 && code <= 0x9FFF) {
        zh += 1;
      } else if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) {
        en += 1;
      }
    }
    if (ja > 0) return '\uC77C\uBCF8\uC5B4';
    if (ko > 0) return '\uD55C\uAD6D\uC5B4';
    if (zh > 0) return '\uC911\uAD6D\uC5B4';
    if (en > 0) return '\uC601\uC5B4';
    return null;
  };

  const handleProofreadDraft = async () => {
    if (!window.electronAPI?.aiGenerate) return;
    const text = replyBody.trim();
    if (!text && !(proofreadIncludeSubject && replySubject.trim())) return;
    setIsAiProofing(true);
    incrementPending();
    try {
      const before = { subject: replySubject, body: replyBody };
      const prompt = buildProofreadPrompt(
        text,
        replySubject.trim(),
        proofreadTone,
        proofreadIncludeSubject,
        proofreadLanguage
      );
      const result = await window.electronAPI.aiGenerate({ prompt });
      const raw = result?.text?.trim();
      if (raw) {
        let nextSubject = replySubject;
        let nextBody = raw;
        if (proofreadIncludeSubject) {
          const parsed = parseProofreadResult(raw);
          if (parsed) {
            nextSubject = parsed.subject || replySubject;
            nextBody = stripProofreadPreamble(parsed.body || replyBody);
          } else {
            nextBody = stripProofreadPreamble(stripBodyLabel(raw));
          }
        } else {
          nextBody = stripProofreadPreamble(stripBodyLabel(raw));
        }
        setReplySubject(nextSubject);
        setReplyBody(nextBody);
        setProofreadBefore(before);
        setProofreadAfter({ subject: nextSubject, body: nextBody });
        setShowProofreadCompare(true);
      }
      addTokens(result?.promptTokens || 0, result?.evalTokens || 0);
    } catch (error) {
      console.error('Failed to proofread draft:', error);
    } finally {
      decrementPending();
      addCompleted();
      setIsAiProofing(false);
    }
  };

  const buildTranslatePrompt = (body: string) =>
    [
      'Translate the following email body to Korean.',
      'Keep line breaks and bullet points.',
      'Do not add any preface or commentary.',
      'Return only the translated body.',
      '',
      body,
    ].join('\n');

  const handleToggleTranslate = async () => {
    if (!window.electronAPI?.aiGenerate || !selectedEmail) return;
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }
    const sourceText = getEmailPlainText();
    if (!sourceText.trim()) return;

    const cacheKey = selectedEmail.id;
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      setTranslatedBody(cached);
      setShowTranslated(true);
      return;
    }

    setIsTranslating(true);
    incrementPending();
    try {
      const prompt = buildTranslatePrompt(sourceText);
      const result = await window.electronAPI.aiGenerate({ prompt });
      const raw = result?.text?.trim() || '';
      if (raw) {
        const cleaned = stripTranslatePreamble(raw);
        translationCacheRef.current.set(cacheKey, cleaned);
        setTranslatedBody(cleaned);
        setShowTranslated(true);
      }
      addTokens(result?.promptTokens || 0, result?.evalTokens || 0);
    } catch (error) {
      console.error('Failed to translate email body:', error);
    } finally {
      decrementPending();
      addCompleted();
      setIsTranslating(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!currentAccountId || !selectedEmail) return;
    try {
      await trashEmail(currentAccountId, selectedEmail.id);
    } catch (error) {
      console.error('Failed to delete draft:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      console.log('[첨부파일] 선택됨:', Array.from(files).map(f => `${f.name} (${f.size}바이트)`));
      setAttachedFiles(prev => [...prev, ...Array.from(files)]);
    }
    e.target.value = ''; // Reset input
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 첨부파일 미리보기 열기
  const handlePreviewAttachment = async (file: File) => {
    console.log('[첨부미리보기] 파일:', file.name, '타입:', file.type, '크기:', file.size);
    const url = URL.createObjectURL(file);
    let type: 'image' | 'pdf' | 'other' = 'other';
    let data: string | undefined;

    if (file.type.startsWith('image/')) {
      type = 'image';
    } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      type = 'pdf';
      // PDF는 base64로 변환해서 PdfViewer에 전달
      data = await fileToBase64(file);
    }

    console.log('[첨부미리보기] 미리보기 타입:', type);
    setAttachmentPreview({ file, url, data, type });
  };

  // 첨부파일 미리보기 닫기
  const handleCloseAttachmentPreview = () => {
    if (attachmentPreview?.url) {
      URL.revokeObjectURL(attachmentPreview.url);
    }
    setAttachmentPreview(null);
  };

  // 드래그 앤 드롭 핸들러
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      console.log('[첨부파일] 드롭됨:', Array.from(files).map(f => `${f.name} (${f.size}바이트)`));
      setAttachedFiles(prev => [...prev, ...Array.from(files)]);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const sanitizeAddresses = (value: string): string[] => {
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const cleaned = value.replace(/[\r\n]+/g, ' ');
    const matches = cleaned.match(emailPattern);
    if (!matches) return [];
    return matches.map((item) => item.trim());
  };

  const buildDraftKey = (
    toList: string[],
    ccList: string[],
    subject: string,
    body: string,
    attachmentKeys: string[]
  ) =>
    JSON.stringify({
      toList,
      ccList,
      subject,
      body,
      attachmentKeys,
    });

  // 파일을 base64로 변환
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // data:mime;base64, 부분 제거
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  // 답장/전달 자동 임시보관
  useEffect(() => {
    if (!currentAccountId) return;
    if (!isReplying && !isForwarding && !isDraftEmail && !isComposing) return;
    if (!selectedEmail && (isReplying || isForwarding || isDraftEmail)) return;
    if (isSending) return;

    const toList = sanitizeAddresses(replyTo);
    const ccList = sanitizeAddresses(replyCc);
    const bccList = sanitizeAddresses(replyBcc);
    const subject = replySubject.trim();
    const body = replyBody;
    const attachmentKeys = attachedFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`);

    const hasContent =
      toList.length > 0 ||
      ccList.length > 0 ||
      bccList.length > 0 ||
      subject.length > 0 ||
      body.trim().length > 0 ||
      attachedFiles.length > 0;

    if (!hasContent) {
      saveDraftNowRef.current = null;
      return;
    }

    const draftKey = buildDraftKey(toList, ccList, subject, body, attachmentKeys);

    if (initialDraftKeyRef.current && draftKey === initialDraftKeyRef.current) {
      saveDraftNowRef.current = null;
      return;
    }

    if (draftKey === lastDraftKeyRef.current) {
      saveDraftNowRef.current = null;
      return;
    }

    const saveDraftNow = async () => {
      try {
        setIsDraftSaving(true);

        const attachments: EmailAttachment[] = await Promise.all(
          attachedFiles.map(async (file) => ({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            data: await fileToBase64(file),
          }))
        );

        console.log('[임시저장] 첨부파일:', attachments.length, '개', attachments.map(a => a.filename));

        const shouldThread = (isReplying || isDraftEmail) && selectedEmail;
        const draft: EmailDraft = {
          to: toList,
          cc: ccList.length > 0 ? ccList : undefined,
          bcc: bccList.length > 0 ? bccList : undefined,
          subject,
          body,
          replyToMessageId: isReplying && selectedEmail ? selectedEmail.id : undefined,
          threadId: shouldThread ? selectedEmail?.threadId : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        };

        if (draftId) {
          console.log('[임시저장] 업데이트:', draftId);
          await window.electronAPI.updateDraft(currentAccountId, draftId, draft);
        } else {
          console.log('[임시저장] 새로 생성');
          const created = await window.electronAPI.createDraft(currentAccountId, draft);
          setDraftId(created.id);
        }

        lastDraftKeyRef.current = draftKey;
      } catch (error) {
        console.error('Failed to save draft:', error);
      } finally {
        setIsDraftSaving(false);
      }
    };

    saveDraftNowRef.current = saveDraftNow;

    if (draftTimerRef.current) {
      window.clearTimeout(draftTimerRef.current);
    }

    draftTimerRef.current = window.setTimeout(saveDraftNow, 1500);

    return () => {
      if (draftTimerRef.current) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [
    currentAccountId,
    isReplying,
    isForwarding,
    isDraftEmail,
    isComposing,
    selectedEmail,
    replyTo,
    replyCc,
    replyBcc,
    replySubject,
    replyBody,
    attachedFiles,
    isSending,
    draftId,
  ]);

  // 언마운트 시에만 미저장 draft flush
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      if (saveDraftNowRef.current) {
        saveDraftNowRef.current();
        saveDraftNowRef.current = null;
      }
    };
  }, []);

  if (!selectedEmail && !isComposing) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select an email.
      </div>
    );
  }

  const handleSendReply = async () => {
    if (!currentAccountId || !replyTo.trim()) return;

    setIsSending(true);

    try {
      // 첨부파일 변환
      const attachments: EmailAttachment[] = await Promise.all(
        attachedFiles.map(async (file) => ({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: await fileToBase64(file),
        }))
      );

      const toList = sanitizeAddresses(replyTo);
      const ccList = sanitizeAddresses(replyCc);
      const bccList = sanitizeAddresses(replyBcc);
      if (toList.length === 0) {
        setIsSending(false);
        return;
      }

      const shouldThread = isReplying || isDraftEmail;
      const draft: EmailDraft = {
        to: toList,
        cc: ccList.length > 0 ? ccList : undefined,
        bcc: bccList.length > 0 ? bccList : undefined,
        subject: replySubject,
        body: replyBody,
        replyToMessageId: isReplying ? selectedEmail?.id : undefined,
        threadId: shouldThread ? selectedEmail?.threadId : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      await sendEmail(currentAccountId, draft);
      if (draftId) {
        try {
          await window.electronAPI.deleteDraft(currentAccountId, draftId);
        } catch (deleteError) {
          console.error('Failed to delete draft:', deleteError);
        }
      }
      if (isDraftEmail && selectedEmail) {
        removeEmail(currentAccountId, selectedEmail.id);
      }
      if (isComposeOnly) {
        setComposing(false);
      }
      setIsAiProofing(false);
      handleCancelReply();
    } catch (error) {
      console.error('Failed to send:', error);
    } finally {
      setIsSending(false);
    }
  };

  const showReplyForm = isReplying || isForwarding || isDraftEmail || isComposing;
  const replyPanelHeight = isDraftEmail || isComposing ? 100 : replyHeight;
  const showAiDraftButton = isReplying || isForwarding;
  const showDeleteDraftButton = isDraftEmail;
  const showProofreadOptions = isComposeOnly || isDraftEmail;
  const canProofread = Boolean(replyBody.trim() || (proofreadIncludeSubject && replySubject.trim()));
  const cancelLabel = isDraftEmail || isComposeOnly ? '\uC791\uC131 \uCDE8\uC18C' : '\uCDE8\uC18C';
  const detectedProofreadLanguage =
    proofreadLanguage === 'auto'
      ? detectLanguageLabel(`${replySubject}\n${replyBody}`)
      : null;
  const bodyForTranslate = selectedEmail ? (plainTextBody || plainTextPreview) : '';
  const fallbackPreview =
    plainTextPreview || selectedEmail?.body || selectedEmail?.snippet || '';
  const detectedBodyLanguage = bodyForTranslate ? detectLanguageLabel(bodyForTranslate) : null;
  const canTranslate = Boolean(selectedEmail && !isBodyLoading && bodyForTranslate.trim());
  const showTranslateButton =
    Boolean(
      selectedEmail &&
        !isDraftEmail &&
        !isComposing &&
        canTranslate &&
        detectedBodyLanguage !== '\uD55C\uAD6D\uC5B4'
    );

  const actionButtons = selectedEmail && !isDraftEmail && !isComposing ? (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleAddTodo}>
              <ListPlus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{'\uD560 \uC77C \uCD94\uAC00'}</TooltipContent>
        </Tooltip>

        {showTranslateButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showTranslated ? 'secondary' : 'ghost'}
                size="icon"
                onClick={handleToggleTranslate}
                disabled={isTranslating}
              >
                {isTranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showTranslated ? '\uC6D0\uBB38 \uBCF4\uAE30' : '\uBC88\uC5ED \uBCF4\uAE30'}
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{'\uC778\uC1C4'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handlePrintToPdf}>
              <FileDown className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{'PDF\uB85C \uC0DD\uC131'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleToggleStar}>
              <Star
                className={cn(
                  'h-4 w-4',
                  selectedEmail.isStarred && 'fill-yellow-500 text-yellow-500'
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {selectedEmail.isStarred ? '\uBCC4\uD45C \uD574\uC81C' : '\uBCC4\uD45C \uCD94\uAC00'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleToggleImportant}>
              <AlertCircle
                className={cn(
                  'h-4 w-4',
                  selectedEmail.isImportant && 'fill-yellow-600 text-yellow-600'
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {selectedEmail.isImportant ? '\uC911\uC694 \uD574\uC81C' : '\uC911\uC694 \uD45C\uC2DC'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleMarkSpam}>
              <ShieldAlert className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{currentView === 'spam' ? '스팸 해제' : '스팸 처리'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleTrash}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{'\uC0AD\uC81C'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={emailBodyAdjustLevel === 'strong' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() =>
                setEmailBodyAdjustLevel(emailBodyAdjustLevel === 'strong' ? 'off' : 'strong')
              }
            >
              {emailBodyAdjustLevel === 'strong' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {emailBodyAdjustLevel === 'strong' ? '본문 보정: 켬' : '본문 보정: 끔'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ) : null;


  // 첨부파일 다운로드
  const handleDownloadAttachment = async (attachmentId: string, filename: string) => {
    if (!currentAccountId || !selectedEmail) return;
    try {
      await window.electronAPI.downloadAttachment(
        currentAccountId,
        selectedEmail.id,
        attachmentId,
        filename
      );
    } catch (error) {
      console.error('Failed to download attachment:', error);
    }
  };

  const handleDownloadAllAttachments = async () => {
    if (!currentAccountId || !selectedEmail || isDownloadingAll) return;
    const attachments =
      selectedEmail.attachments?.filter((att) => !att.mimeType.startsWith('image/')) || [];
    if (attachments.length === 0) return;
    setIsDownloadingAll(true);
    try {
      for (const attachment of attachments) {
        await handleDownloadAttachment(attachment.id, attachment.filename);
      }
    } finally {
      setIsDownloadingAll(false);
    }
  };

  // 첨부파일 클릭 핸들러 (PDF는 미리보기, 나머지는 무시)
  const handleAttachmentClick = async (attachmentId: string, filename: string, mimeType: string) => {
    if (!currentAccountId || !selectedEmail) return;

    const lowerName = filename.toLowerCase();
    const isHtml =
      mimeType === 'text/html' ||
      lowerName.endsWith('.html') ||
      lowerName.endsWith('.htm');
    const isHwp =
      mimeType === 'application/x-hwp' ||
      mimeType === 'application/vnd.hancom.hwp' ||
      mimeType === 'application/haansofthwp' ||
      mimeType === 'application/vnd.hancom.hwpx' ||
      lowerName.endsWith('.hwp') ||
      lowerName.endsWith('.hwpx');
    const isOffice =
      mimeType === 'application/msword' ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.ms-powerpoint' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      lowerName.endsWith('.doc') ||
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.xls') ||
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.ppt') ||
      lowerName.endsWith('.pptx');

    if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
      setLoadingPdf(true);
      try {
        const result = await window.electronAPI.getAttachment(
          currentAccountId,
          selectedEmail.id,
          attachmentId
        );
        setPdfPreview({ data: result.data, filename });
      } catch (error) {
        console.error('Failed to load PDF:', error);
      } finally {
        setLoadingPdf(false);
      }
      return;
    }

    if (isHtml) {
      setLoadingPdf(true);
      try {
        const result = await window.electronAPI.getAttachment(
          currentAccountId,
          selectedEmail.id,
          attachmentId
        );
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const html = new TextDecoder('utf-8').decode(bytes);
        setHwpPreview({ html, filename });
      } catch (error) {
        console.error('Failed to preview HTML attachment:', error);
      } finally {
        setLoadingPdf(false);
      }
      return;
    }

    if (isHwp) {
      setLoadingPdf(true);
      try {
        const result = await window.electronAPI.previewHwpAttachment(
          currentAccountId,
          selectedEmail.id,
          attachmentId,
          filename
        );
        if (result?.ok && result.html) {
          setHwpPreview({ html: result.html, filename });
        } else {
          window.alert('한글(HWP) 문서 미리보기에 실패했습니다.');
        }
      } catch (error) {
        console.error('Failed to preview HWP attachment:', error);
        window.alert('한글(HWP) 문서 미리보기에 실패했습니다.');
      } finally {
        setLoadingPdf(false);
      }
      return;
    }

    if (isOffice) {
      setLoadingPdf(true);
      try {
        const result = await window.electronAPI.previewOfficeAttachment(
          currentAccountId,
          selectedEmail.id,
          attachmentId,
          filename
        );
        if (result?.ok && result.data) {
          const previewName = result.filename || filename.replace(/\.(docx?|pptx?|xlsx?)$/i, '.pdf');
          setPdfPreview({ data: result.data, filename: previewName });
        } else if (result?.reason === 'no_converter') {
          window.alert('문서 미리보기를 위해 LibreOffice가 필요합니다.');
        } else {
          window.alert('문서 미리보기 변환에 실패했습니다.');
        }
      } catch (error) {
        console.error('Failed to preview office attachment:', error);
        window.alert('문서 미리보기 변환에 실패했습니다.');
      } finally {
        setLoadingPdf(false);
      }
      return;
    }
  };

  // PDF 미리보기 닫기
  const closePdfPreview = () => {
    setPdfPreview(null);
  };

  // 파일 아이콘 선택
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return FileImage;
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text') || mimeType.includes('hwp') || mimeType.includes('hancom')) return FileText;
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return FileArchive;
    return File;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      {!isDraftEmail && !isComposing && selectedEmail && (
      <div className="border-b p-4 shrink-0">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold flex-1 whitespace-normal break-words">{selectedEmail.subject || '(제목 없음)'}</h2>
              {/* 날짜/시간 눈에 띄게 표시 - 위: 날짜, 아래: 시간 */}
              <div className="text-right shrink-0">
                <div className="text-sm font-medium text-foreground">
                  {formatFullDate(new Date(selectedEmail.date))}
                </div>
                <div className="text-sm text-blue-500 font-medium">
                  {formatTime(new Date(selectedEmail.date))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">
                {getSenderDisplayName(selectedEmail.from.name, selectedEmail.from.email)}
              </span>
              <span className="text-muted-foreground">&lt;{getSenderEmailAddress(selectedEmail.from.email)}&gt;</span>
            </div>
            <CollapsibleAddressList
              label="받는 사람"
              addresses={selectedEmail.to}
              className="mt-1"
            />
            {selectedEmail.cc && selectedEmail.cc.length > 0 && (
              <CollapsibleAddressList
                label="참조"
                addresses={selectedEmail.cc}
              />
            )}
          </div>

        </div>

        {/* Reply/Forward buttons */}
        <div className={cn('flex items-center gap-2 mt-4', showReplyForm ? 'justify-end' : 'justify-between')}>
          {!showReplyForm && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleStartReply}>
                <Reply className="h-4 w-4 mr-2" />
                {'\uB2F5\uC7A5'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleStartReplyAll}>
                <ReplyAll className="h-4 w-4 mr-2" />
                {'\uC804\uCCB4\uB2F5\uC7A5'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleStartForward}>
                <Forward className="h-4 w-4 mr-2" />
                {'\uC804\uB2EC'}
              </Button>
            </div>
          )}
          {actionButtons}
        </div>

        {selectedEmail.attachments && selectedEmail.attachments.filter(att => !att.mimeType.startsWith('image/')).length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  첨부파일 ({selectedEmail.attachments.filter(att => !att.mimeType.startsWith('image/')).length})
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={handleDownloadAllAttachments}
                disabled={isDownloadingAll}
              >
                <Download className="mr-1 h-3 w-3" />
                {isDownloadingAll ? '다운로드 중...' : '전체 다운로드'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedEmail.attachments
                .filter(att => !att.mimeType.startsWith('image/'))
                .map((attachment) => {
                  const FileIcon = getFileIcon(attachment.mimeType);
                  const lowerName = attachment.filename.toLowerCase();
                  const isPdf = attachment.mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
                  const isHtml =
                    attachment.mimeType === 'text/html' ||
                    lowerName.endsWith('.html') ||
                    lowerName.endsWith('.htm');
                  const isHwp =
                    attachment.mimeType === 'application/x-hwp' ||
                    attachment.mimeType === 'application/vnd.hancom.hwp' ||
                    attachment.mimeType === 'application/haansofthwp' ||
                    attachment.mimeType === 'application/vnd.hancom.hwpx' ||
                    lowerName.endsWith('.hwp') ||
                    lowerName.endsWith('.hwpx');
                  const isOffice =
                    attachment.mimeType === 'application/msword' ||
                    attachment.mimeType === 'application/vnd.ms-excel' ||
                    attachment.mimeType === 'application/vnd.ms-powerpoint' ||
                    attachment.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                    attachment.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                    attachment.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                    lowerName.endsWith('.doc') ||
                    lowerName.endsWith('.docx') ||
                    lowerName.endsWith('.xls') ||
                    lowerName.endsWith('.xlsx') ||
                    lowerName.endsWith('.ppt') ||
                    lowerName.endsWith('.pptx');
                  const canPreview = isPdf || isOffice || isHwp || isHtml;
                  return (
                    <ContextMenu key={attachment.id}>
                      <ContextMenuTrigger>
                        <button
                          onClick={() => handleAttachmentClick(attachment.id, attachment.filename, attachment.mimeType)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/30 hover:bg-muted transition-colors text-sm",
                            canPreview && "cursor-pointer",
                            !canPreview && "cursor-default"
                          )}
                          title={canPreview ? `${attachment.filename} (클릭하여 미리보기)` : `${attachment.filename} (우클릭하여 다운로드)`}
                        >
                          <FileIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="max-w-[150px] truncate">{attachment.filename}</span>
                          <span className="text-xs text-muted-foreground">({formatFileSize(attachment.size)})</span>
                          {canPreview && <Eye className="h-3 w-3 text-blue-500" />}
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        {canPreview && (
                          <ContextMenuItem onClick={() => handleAttachmentClick(attachment.id, attachment.filename, attachment.mimeType)}>
                            <Eye className="mr-2 h-4 w-4" />
                            미리보기
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem onClick={() => handleDownloadAttachment(attachment.id, attachment.filename)}>
                          <Download className="mr-2 h-4 w-4" />
                          다운로드
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => {
                          navigator.clipboard.writeText(attachment.filename);
                        }}>
                          <File className="mr-2 h-4 w-4" />
                          파일명 복사
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      )}

      {/* Content area - split when replying */}
      {!isDraftEmail && !isComposing && selectedEmail && (
        <div
          className={cn('flex flex-col min-h-0 overflow-hidden', !showReplyForm && 'flex-1')}
          style={showReplyForm ? { maxHeight: `${100 - replyPanelHeight}%` } : { height: '100%' }}
        >
        {/* Email Body */}
        <div className="overflow-hidden flex flex-col flex-1">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {isBodyLoading ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">{selectedEmail.snippet}</p>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">{'\uC804\uCCB4 \uB0B4\uC6A9 \uB85C\uB529 \uC911...'}</span>
                      </div>
                    </div>
                  ) : showTranslated ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm">{translatedBody}</pre>
                  ) : selectedEmail.bodyHtml ? (
                    <>
                      <div
                        className={cn(
                          'email-content',
                          emailBodyAdjustLevel === 'strong' && 'email-content-adjust-strong'
                        )}
                        dangerouslySetInnerHTML={{ __html: deferredHtml || '' }}
                      />
                      {!deferredHtml && fallbackPreview && (
                        <pre className="whitespace-pre-wrap font-sans text-sm">{fallbackPreview}</pre>
                      )}
                    </>
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm">{fallbackPreview}</pre>
                  )}

              {/* 인라인 이미지 표시 */}
                  {!showTranslated && selectedEmail.attachments && selectedEmail.attachments.some(att => att.mimeType.startsWith('image/')) && (
                <div className="mt-4 space-y-3">
                  {loadingImages && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">이미지 로딩 중...</span>
                    </div>
                  )}
                  {selectedEmail.attachments
                    .filter(att => att.mimeType.startsWith('image/'))
                    .map((att) => (
                      inlineImages[att.id] && (
                        <ContextMenu key={att.id}>
                          <ContextMenuTrigger>
                            <div className="rounded-lg overflow-hidden border">
                              <img
                                src={inlineImages[att.id]}
                                alt={att.filename}
                                loading="lazy"
                                decoding="async"
                                className="max-w-full h-auto"
                              />
                              <div className="px-3 py-2 bg-muted/50 text-xs text-muted-foreground flex items-center justify-between">
                                <span title={att.filename}>{att.filename}</span>
                                <button
                                  onClick={() => handleDownloadAttachment(att.id, att.filename)}
                                  className="flex items-center gap-1 hover:text-foreground"
                                >
                                  <Download className="h-3 w-3" />
                                  저장
                                </button>
                              </div>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem onClick={() => handleDownloadAttachment(att.id, att.filename)}>
                              <Download className="mr-2 h-4 w-4" />
                              이미지 저장
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => {
                              navigator.clipboard.writeText(att.filename);
                            }}>
                              <File className="mr-2 h-4 w-4" />
                              파일명 복사
                            </ContextMenuItem>
                            <ContextMenuItem onClick={async () => {
                              // 이미지 데이터를 클립보드에 복사
                              try {
                                const response = await fetch(inlineImages[att.id]);
                                const blob = await response.blob();
                                await navigator.clipboard.write([
                                  new ClipboardItem({ [blob.type]: blob })
                                ]);
                              } catch (e) {
                                console.error('Failed to copy image:', e);
                              }
                            }}>
                              <Image className="mr-2 h-4 w-4" />
                              이미지 복사
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )
                    ))
                  }
                </div>
              )}

            </div>
              </ScrollArea>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={handleStartReply}>
                <Reply className="mr-2 h-4 w-4" />
                답장
              </ContextMenuItem>
              <ContextMenuItem onClick={handleStartForward}>
                <Forward className="mr-2 h-4 w-4" />
                전달
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleAddTodo}>
                <ListPlus className="mr-2 h-4 w-4" />
                할 일로 추가
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleToggleStar}>
                <Star className={cn('mr-2 h-4 w-4', selectedEmail.isStarred && 'fill-yellow-500 text-yellow-500')} />
                {selectedEmail.isStarred ? '별표 해제' : '별표 추가'}
              </ContextMenuItem>
              <ContextMenuItem onClick={handleToggleImportant}>
                <AlertCircle className={cn('mr-2 h-4 w-4', selectedEmail.isImportant && 'fill-yellow-600 text-yellow-600')} />
                {selectedEmail.isImportant ? '중요 해제' : '중요 표시'}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => {
                const selection = window.getSelection()?.toString();
                if (selection) {
                  navigator.clipboard.writeText(selection);
                }
              }}>
                <File className="mr-2 h-4 w-4" />
                선택 텍스트 복사
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleMarkSpam} className="text-destructive focus:text-destructive">
                <ShieldAlert className="mr-2 h-4 w-4" />
                {currentView === 'spam' ? '스팸 해제' : '스팸 처리'}
              </ContextMenuItem>
              <ContextMenuItem onClick={handleTrash} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </div>
      )}

            {/* Resizer for reply panel */}
        {showReplyForm && !isDraftEmail && !isComposing && (
          <Resizer
            direction="horizontal"
            onResize={(delta) => {
              const containerHeight = document.querySelector('.flex-1.flex.flex-col.min-h-0.overflow-hidden')?.clientHeight || 500;
              const deltaPercent = (delta / containerHeight) * 100;
              setReplyHeight((h) => Math.max(25, Math.min(75, h - deltaPercent)));
            }}
          />
        )}

        {/* Inline Reply/Forward Form */}
        {showReplyForm && (
          <div
            style={{ height: `${replyPanelHeight}%` }}
            className={cn(
              "flex flex-col min-h-0 border-t bg-muted/20 overflow-hidden relative",
              isDraggingFile && "ring-2 ring-primary ring-inset"
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* 드래그 오버레이 */}
            {isDraggingFile && (
              <div className="absolute inset-0 bg-primary/10 z-50 flex items-center justify-center pointer-events-none">
                <div className="bg-background/90 rounded-lg px-6 py-4 shadow-lg border-2 border-dashed border-primary">
                  <p className="text-sm font-medium text-primary">파일을 여기에 놓으세요</p>
                </div>
              </div>
            )}
            <div className="p-3 border-b space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {isComposeOnly
                    ? '\uC0C8 \uBA54\uC77C'
                    : isDraftEmail
                      ? '\uC784\uC2DC\uBCF4\uAD00\uD568 \uD3B8\uC9D1'
                      : isReplying
                        ? '\uB2F5\uC7A5'
                        : '\uC804\uB2EC'}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelReply}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-16 text-sm text-muted-foreground shrink-0">{'\uBC1B\uB294 \uC0AC\uB78C'}</label>
                <ContactInput
                  value={replyTo}
                  onChange={setReplyTo}
                  placeholder={'\uC774\uBA54\uC77C \uC8FC\uC18C'}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-16 text-sm text-muted-foreground shrink-0">{'\uCC38\uC870'}</label>
                <ContactInput
                  value={replyCc}
                  onChange={setReplyCc}
                  placeholder={'\uCC38\uC870 (\uC120\uD0DD)'}
                  className="h-8 text-sm"
                />
              </div>
              {(isComposeOnly || isDraftEmail) && (
                <div className="flex items-center gap-2">
                  <label className="w-16 text-sm text-muted-foreground shrink-0">{'\uC228\uC740\uCC38\uC870'}</label>
                  <ContactInput
                    value={replyBcc}
                    onChange={setReplyBcc}
                    placeholder={'\uC228\uC740\uCC38\uC870 (\uC120\uD0DD)'}
                    className="h-8 text-sm"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="w-16 text-sm text-muted-foreground shrink-0">{'\uC81C\uBAA9'}</label>
                <Input
                  type="text"
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              {showProofreadOptions && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">{'\uAD50\uC815 \uC635\uC158'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{'\uD1A4'}</span>
                    <div className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 p-0.5">
                      <button
                        type="button"
                        onClick={() => setProofreadTone('formal')}
                        aria-pressed={proofreadTone === 'formal'}
                        className={cn(
                          'px-2 py-1 text-xs rounded-full transition-colors',
                          proofreadTone === 'formal'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {'\uACA9\uC2DD'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProofreadTone('casual')}
                        aria-pressed={proofreadTone === 'casual'}
                        className={cn(
                          'px-2 py-1 text-xs rounded-full transition-colors',
                          proofreadTone === 'casual'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {'\uCE90\uC8FC\uC5BC'}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProofreadIncludeSubject((prev) => !prev)}
                    aria-pressed={proofreadIncludeSubject}
                    className={cn(
                      'px-2 py-1 text-xs rounded-full border transition-colors',
                      proofreadIncludeSubject
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/60 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {'\uC81C\uBAA9\uAE4C\uC9C0 \uAD50\uC815'}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{'\uC5B8\uC5B4'}</span>
                    <select
                      value={proofreadLanguage}
                      onChange={(e) => setProofreadLanguage(e.target.value as typeof proofreadLanguage)}
                      className="h-7 rounded-full border border-border/60 bg-background/60 px-2 text-xs text-foreground"
                    >
                      <option value="auto">{'\uC790\uB3D9'}</option>
                      <option value="ko">{'\uD55C\uAD6D\uC5B4'}</option>
                      <option value="en">{'\uC601\uC5B4'}</option>
                      <option value="ja">{'\uC77C\uBCF8\uC5B4'}</option>
                      <option value="zh">{'\uC911\uAD6D\uC5B4'}</option>
                    </select>
                    {proofreadLanguage === 'auto' && (
                      <span className="text-[11px] text-muted-foreground">
                        {detectedProofreadLanguage
                          ? `\uAC10\uC9C0\uB428: ${detectedProofreadLanguage}`
                          : '\uAC10\uC9C0\uB428: -'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowProofreadCompare((prev) => !prev)}
                    aria-pressed={showProofreadCompare}
                    disabled={!proofreadAfter}
                    className={cn(
                      'px-2 py-1 text-xs rounded-full border transition-colors',
                      showProofreadCompare
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/60 text-muted-foreground hover:text-foreground',
                      !proofreadAfter && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {'\uAD50\uC815 \uC804/\uD6C4 \uBE44\uAD50 \uBCF4\uAE30'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-3 min-h-0 overflow-hidden">
              <Textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={'\uB0B4\uC6A9\uC744 \uC785\uB825\uD558\uC138\uC694..'}
                className="h-full min-h-[80px] resize-none text-sm"
              />
            </div>

            {showProofreadCompare && proofreadBefore && proofreadAfter && (
              <div className="px-3 pb-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                    <div className="text-xs font-medium mb-2">{'\uAD50\uC815 \uC804'}</div>
                    {proofreadIncludeSubject && (
                      <div className="mb-2">
                        <div className="text-[11px] text-muted-foreground mb-1">{'\uC81C\uBAA9'}</div>
                        <div className="text-xs whitespace-pre-wrap">{proofreadBefore.subject || '-'}</div>
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mb-1">{'\uBCF8\uBB38'}</div>
                    <div className="text-xs whitespace-pre-wrap max-h-40 overflow-auto">
                      {proofreadBefore.body || '-'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                    <div className="text-xs font-medium mb-2">{'\uAD50\uC815 \uD6C4'}</div>
                    {proofreadIncludeSubject && (
                      <div className="mb-2">
                        <div className="text-[11px] text-muted-foreground mb-1">{'\uC81C\uBAA9'}</div>
                        <div className="text-xs whitespace-pre-wrap">{proofreadAfter.subject || '-'}</div>
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mb-1">{'\uBCF8\uBB38'}</div>
                    <div className="text-xs whitespace-pre-wrap max-h-40 overflow-auto">
                      {proofreadAfter.body || '-'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 첨부파일 목록 */}
            {attachedFiles.length > 0 && (
              <div className="px-3 py-2 border-t flex flex-wrap gap-2">
                {attachedFiles.map((file, index) => {
                  const isImage = file.type.startsWith('image/');
                  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                  const canPreview = isImage || isPdf;

                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex items-center gap-2 bg-muted px-2 py-1 rounded text-xs",
                        canPreview && "cursor-pointer hover:bg-muted/80"
                      )}
                      onClick={() => canPreview && handlePreviewAttachment(file)}
                      title={canPreview ? "클릭하여 미리보기" : file.name}
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="truncate max-w-[150px]">{file.name}</span>
                      <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                      {canPreview && <Eye className="h-3 w-3 text-blue-500" />}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(index);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-3 border-t flex items-center justify-between shrink-0">
              <div className="flex gap-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  multiple
                />
                <input
                  type="file"
                  ref={imageInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  className="hidden"
                  multiple
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  title="파일 첨부"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => imageInputRef.current?.click()}
                  title="이미지 첨부"
                >
                  <Image className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                {showAiDraftButton && (
                  <Button variant="outline" size="sm" onClick={handleGenerateReply} disabled={isAiReplying}>
                    {isAiReplying ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {'AI \uCD08\uC548'}
                  </Button>
                )}
                {showDeleteDraftButton && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteDraft}
                    className="text-destructive border-destructive/40 hover:text-destructive"
                  >
                    {'\uC784\uC2DC\uBCF4\uAD00 \uC0AD\uC81C'}
                  </Button>
                )}
                {(isComposeOnly || isDraftEmail) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleProofreadDraft}
                    disabled={isAiProofing || !canProofread}
                  >
                    {isAiProofing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {'AI \uAD50\uC815'}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleCancelReply}>
                  {cancelLabel}
                </Button>
                <Button size="sm" onClick={handleSendReply} disabled={isSending || !replyTo.trim()}>
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {'\uBCF4\uB0B4\uAE30'}
                </Button>
              </div>
            </div>
          </div>
        )}

      {/* PDF 미리보기 모달 */}
      {pdfPreview && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center">
          <div className="relative w-[90vw] h-[90vh] bg-background rounded-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <span className="font-medium truncate">{pdfPreview.filename}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedEmail) {
                      const attachment = selectedEmail.attachments?.find(a => a.filename === pdfPreview.filename);
                      if (attachment) {
                        handleDownloadAttachment(attachment.id, attachment.filename);
                      }
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  다운로드
                </Button>
                <Button variant="ghost" size="icon" onClick={closePdfPreview}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <PdfViewer data={pdfPreview.data} />
            </div>
          </div>
        </div>
      )}

      {/* HWP 미리보기 모달 */}
      {hwpPreview && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center">
          <div className="relative w-[90vw] h-[90vh] bg-white rounded-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-3 border-b bg-background">
              <span className="font-medium truncate">{hwpPreview.filename}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedEmail) {
                      const attachment = selectedEmail.attachments?.find(
                        a => a.filename === hwpPreview.filename
                      );
                      if (attachment) {
                        handleDownloadAttachment(attachment.id, attachment.filename);
                      }
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  다운로드
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setHwpPreview(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-white flex justify-center">
              <div
                className="hwp-preview-content text-black"
                style={{ fontFamily: '맑은 고딕, Malgun Gothic, Batang, sans-serif', color: '#000', background: '#fff', maxWidth: '800px', width: '100%', padding: '20px' }}
                dangerouslySetInnerHTML={{ __html: hwpPreview.html }}
              />
            </div>
          </div>
        </div>
      )}

      {/* PDF 로딩 인디케이터 */}
      {loadingPdf && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center">
          <div className="bg-background p-4 rounded-lg flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>문서 로딩 중...</span>
          </div>
        </div>
      )}

      {/* 첨부파일 미리보기 모달 */}
      {attachmentPreview && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"
          onClick={handleCloseAttachmentPreview}
        >
          <div
            className="relative w-[90vw] h-[90vh] bg-background rounded-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b">
              <span className="font-medium truncate">{attachmentPreview.file.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {formatFileSize(attachmentPreview.file.size)}
                </span>
                <Button variant="ghost" size="icon" onClick={handleCloseAttachmentPreview}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className={cn(
              "flex-1 overflow-hidden",
              attachmentPreview.type !== 'pdf' && "flex items-center justify-center p-4"
            )}>
              {attachmentPreview.type === 'image' && (
                <img
                  src={attachmentPreview.url}
                  alt={attachmentPreview.file.name}
                  className="max-w-full max-h-full object-contain"
                />
              )}
              {attachmentPreview.type === 'pdf' && attachmentPreview.data && (
                <PdfViewer data={attachmentPreview.data} />
              )}
              {attachmentPreview.type === 'other' && (
                <div className="text-center text-muted-foreground">
                  <File className="h-16 w-16 mx-auto mb-4" />
                  <p>이 파일 형식은 미리보기를 지원하지 않습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const EmailView = memo(EmailViewComponent);
