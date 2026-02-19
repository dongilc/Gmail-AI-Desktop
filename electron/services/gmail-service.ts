import { google, Auth, gmail_v1 } from 'googleapis';
import { Email, EmailAddress, EmailDraft, Attachment, EmailAttachment } from '../../src/types';

interface InlineImage {
  contentId: string;
  data: string;
  mimeType: string;
}

export class GmailService {
  private getClient(auth: Auth.OAuth2Client): gmail_v1.Gmail {
    return google.gmail({ version: 'v1', auth });
  }

  private decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf-8');
  }

  private buildRawMessage(draft: EmailDraft): string {
    if (draft.attachments && draft.attachments.length > 0) {
      const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2)}`;

      const headers = [
        draft.to?.length ? `To: ${draft.to.join(', ')}` : '',
        draft.cc?.length ? `Cc: ${draft.cc.join(', ')}` : '',
        draft.bcc?.length ? `Bcc: ${draft.bcc.join(', ')}` : '',
        draft.subject ? `Subject: =?UTF-8?B?${Buffer.from(draft.subject).toString('base64')}?=` : '',
        draft.replyToMessageId ? `In-Reply-To: <${draft.replyToMessageId}>` : '',
        draft.replyToMessageId ? `References: <${draft.replyToMessageId}>` : '',
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ].filter(Boolean).join('\r\n');

      const bodyPart = [
        `--${boundary}`,
        `Content-Type: ${draft.isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(draft.body || '').toString('base64'),
      ].join('\r\n');

      const attachmentParts = draft.attachments.map((att) => [
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${att.filename}"`,
        '',
        att.data,
      ].join('\r\n')).join('\r\n');

      return `${headers}\r\n\r\n${bodyPart}\r\n${attachmentParts}\r\n--${boundary}--`;
    }

    const messageParts = [
      draft.to?.length ? `To: ${draft.to.join(', ')}` : '',
      draft.cc?.length ? `Cc: ${draft.cc.join(', ')}` : '',
      draft.bcc?.length ? `Bcc: ${draft.bcc.join(', ')}` : '',
      draft.subject ? `Subject: =?UTF-8?B?${Buffer.from(draft.subject).toString('base64')}?=` : '',
      draft.replyToMessageId ? `In-Reply-To: <${draft.replyToMessageId}>` : '',
      draft.replyToMessageId ? `References: <${draft.replyToMessageId}>` : '',
      `Content-Type: ${draft.isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
      '',
      draft.body || '',
    ].filter(Boolean).join('\r\n');

    return messageParts;
  }

  // 첨부파일 데이터 가져오기
  private async getAttachmentData(
    gmail: gmail_v1.Gmail,
    messageId: string,
    attachmentId: string
  ): Promise<string> {
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });
    return response.data.data || '';
  }

  async getMessages(
    auth: Auth.OAuth2Client,
    options: { labelIds?: string[]; maxResults?: number; pageToken?: string; query?: string }
  ): Promise<{ messages: Email[]; nextPageToken?: string }> {
    const gmail = this.getClient(auth);

    const response = await gmail.users.messages.list({
      userId: 'me',
      labelIds: options.labelIds && options.labelIds.length > 0 ? options.labelIds : undefined,
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken,
      q: options.query,
    });

    let messages: Email[] = [];
    if (response.data.messages) {
      // 병렬로 메시지 가져오기 (최대 10개씩 배치 처리)
      const batchSize = 10;
      const messageIds = response.data.messages.map(msg => msg.id!);

      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => this.getMessagePreview(auth, id))
        );
        messages = messages.concat(batchResults);
      }
    }

    return {
      messages,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  // 목록용 경량 프리뷰 (인라인 이미지 로딩 안함, 첨부파일 정보는 포함)
  async getMessagePreview(auth: Auth.OAuth2Client, messageId: string): Promise<Email> {
    const gmail = this.getClient(auth);

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full', // 첨부파일 정보를 위해 full 사용
    });

    const message = response.data;
    const headers = message.payload?.headers || [];

    const getHeader = (name: string): string => {
      const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const parseEmailAddress = (value: string): EmailAddress => {
      const match = value.match(/(?:"?([^"]*)"?\s)?<?([^>]*)>?/);
      if (match) {
        return {
          name: match[1]?.trim() || undefined,
          email: match[2]?.trim() || value.trim(),
        };
      }
      return { email: value.trim() };
    };

    const parseEmailAddresses = (value: string): EmailAddress[] => {
      if (!value) return [];
      return value.split(',').map((addr) => parseEmailAddress(addr.trim()));
    };

    // 첨부파일 정보만 추출 (데이터는 로딩 안함)
    const attachments: Attachment[] = [];
    const extractAttachments = (part: gmail_v1.Schema$MessagePart): void => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        part.parts.forEach(extractAttachments);
      }
    };

    if (message.payload) {
      extractAttachments(message.payload);
    }

    const labels = message.labelIds || [];

    return {
      id: message.id!,
      threadId: message.threadId!,
      accountId: '',
      from: parseEmailAddress(getHeader('From')),
      to: parseEmailAddresses(getHeader('To')),
      cc: parseEmailAddresses(getHeader('Cc')) || undefined,
      bcc: parseEmailAddresses(getHeader('Bcc')) || undefined,
      subject: getHeader('Subject'),
      snippet: message.snippet || '',
      body: '', // 목록에선 본문 안 가져옴
      bodyHtml: undefined,
      date: new Date(parseInt(message.internalDate || '0', 10)),
      isRead: !labels.includes('UNREAD'),
      isStarred: labels.includes('STARRED'),
      isImportant: labels.includes('IMPORTANT'),
      labels,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  // 전체 메시지 (인라인 이미지 포함)
  async getMessage(auth: Auth.OAuth2Client, messageId: string): Promise<Email> {
    const gmail = this.getClient(auth);

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const message = response.data;
    const headers = message.payload?.headers || [];

    const getHeader = (name: string): string => {
      const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const parseEmailAddress = (value: string): EmailAddress => {
      const match = value.match(/(?:"?([^"]*)"?\s)?<?([^>]*)>?/);
      if (match) {
        return {
          name: match[1]?.trim() || undefined,
          email: match[2]?.trim() || value.trim(),
        };
      }
      return { email: value.trim() };
    };

    const parseEmailAddresses = (value: string): EmailAddress[] => {
      if (!value) return [];
      return value.split(',').map((addr) => parseEmailAddress(addr.trim()));
    };

    // 본문 추출
    let body = '';
    let bodyHtml = '';
    const attachments: Attachment[] = [];
    const inlineImageParts: { contentId: string; filename: string; attachmentId: string; mimeType: string }[] = [];

    const extractBody = (part: gmail_v1.Schema$MessagePart): void => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body = this.decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        bodyHtml = this.decodeBase64Url(part.body.data);
      } else if (part.mimeType?.startsWith('image/') && part.body?.attachmentId) {
        // 인라인 이미지 정보 수집 (나중에 로딩)
        const contentIdHeader = part.headers?.find(h => h.name?.toLowerCase() === 'content-id');
        const contentId = contentIdHeader?.value?.replace(/[<>]/g, '') || '';
        const filename = part.filename || '';

        // Content-ID가 있거나 파일명이 있으면 인라인 이미지로 처리
        if (contentId || filename) {
          inlineImageParts.push({
            contentId,
            filename,
            attachmentId: part.body.attachmentId,
            mimeType: part.mimeType,
          });
        }

        // 첨부파일 목록에도 추가
        if (filename) {
          attachments.push({
            id: part.body.attachmentId,
            filename,
            mimeType: part.mimeType || 'application/octet-stream',
            size: part.body.size || 0,
          });
        }
      } else if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }

      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    };

    if (message.payload) {
      extractBody(message.payload);
    }

    // 본문이 직접 payload에 있는 경우
    if (!body && !bodyHtml && message.payload?.body?.data) {
      const decoded = this.decodeBase64Url(message.payload.body.data);
      if (message.payload.mimeType === 'text/html') {
        bodyHtml = decoded;
      } else {
        body = decoded;
      }
    }

    // 인라인 이미지 로딩 및 CID 교체 (병렬로 처리)
    if (bodyHtml && inlineImageParts.length > 0) {
      try {
        const inlineImages = await Promise.all(
          inlineImageParts.map(async (part) => {
            try {
              const data = await this.getAttachmentData(gmail, messageId, part.attachmentId);
              return { ...part, data };
            } catch (e) {
              console.error('Failed to fetch inline image:', e);
              return null;
            }
          })
        );

        for (const img of inlineImages) {
          if (img && img.data) {
            // URL-safe base64를 표준 base64로 변환
            const standardBase64 = img.data.replace(/-/g, '+').replace(/_/g, '/');
            const dataUrl = `data:${img.mimeType};base64,${standardBase64}`;

            // 1. Content-ID로 매칭 (cid:xxx 형식)
            if (img.contentId) {
              const cidPattern = new RegExp(`cid:${img.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
              bodyHtml = bodyHtml.replace(cidPattern, dataUrl);
            }

            // 2. 파일명으로 매칭 (cid:filename 형식 - 일부 이메일 클라이언트)
            if (img.filename) {
              const filenamePattern = new RegExp(`cid:${img.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
              bodyHtml = bodyHtml.replace(filenamePattern, dataUrl);

              // 3. 파일명만 있는 src 속성도 매칭 (src="filename" 형식)
              const srcFilenamePattern = new RegExp(
                `(src=["'])${img.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'])`,
                'gi'
              );
              bodyHtml = bodyHtml.replace(srcFilenamePattern, `$1${dataUrl}$2`);
            }
          }
        }
      } catch (e) {
        console.error('Failed to process inline images:', e);
      }
    }

    const labels = message.labelIds || [];

    return {
      id: message.id!,
      threadId: message.threadId!,
      accountId: '', // 호출자가 설정
      from: parseEmailAddress(getHeader('From')),
      to: parseEmailAddresses(getHeader('To')),
      cc: parseEmailAddresses(getHeader('Cc')) || undefined,
      bcc: parseEmailAddresses(getHeader('Bcc')) || undefined,
      subject: getHeader('Subject'),
      snippet: message.snippet || '',
      body,
      bodyHtml: bodyHtml || undefined,
      date: new Date(parseInt(message.internalDate || '0', 10)),
      isRead: !labels.includes('UNREAD'),
      isStarred: labels.includes('STARRED'),
      isImportant: labels.includes('IMPORTANT'),
      labels,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  async sendMessage(auth: Auth.OAuth2Client, draft: EmailDraft): Promise<{ id: string }> {
    const gmail = this.getClient(auth);

    const rawMessage = this.buildRawMessage(draft);

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: draft.threadId,
      },
    });

    return { id: response.data.id! };
  }

  async createDraft(auth: Auth.OAuth2Client, draft: EmailDraft): Promise<{ id: string; messageId?: string }> {
    const gmail = this.getClient(auth);
    const rawMessage = this.buildRawMessage(draft);
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
          threadId: draft.threadId,
        },
      },
    });

    return { id: response.data.id!, messageId: response.data.message?.id };
  }

  async updateDraft(auth: Auth.OAuth2Client, draftId: string, draft: EmailDraft): Promise<void> {
    const gmail = this.getClient(auth);
    const rawMessage = this.buildRawMessage(draft);
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.drafts.update({
      userId: 'me',
      id: draftId,
      requestBody: {
        message: {
          raw: encodedMessage,
          threadId: draft.threadId,
        },
      },
    });
  }

  async deleteDraft(auth: Auth.OAuth2Client, draftId: string): Promise<void> {
    const gmail = this.getClient(auth);
    await gmail.users.drafts.delete({
      userId: 'me',
      id: draftId,
    });
  }

  async modifyMessage(
    auth: Auth.OAuth2Client,
    messageId: string,
    addLabels?: string[],
    removeLabels?: string[]
  ): Promise<void> {
    const gmail = this.getClient(auth);

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: addLabels,
        removeLabelIds: removeLabels,
      },
    });
  }

  async trashMessage(auth: Auth.OAuth2Client, messageId: string): Promise<void> {
    const gmail = this.getClient(auth);

    await gmail.users.messages.trash({
      userId: 'me',
      id: messageId,
    });
  }

  // 현재 사용자의 historyId 조회
  async getProfile(auth: Auth.OAuth2Client): Promise<{ historyId: string }> {
    const gmail = this.getClient(auth);
    const response = await gmail.users.getProfile({ userId: 'me' });
    return { historyId: response.data.historyId! };
  }

  // historyId 이후의 변경분 조회
  async getHistory(
    auth: Auth.OAuth2Client,
    startHistoryId: string
  ): Promise<{
    historyId: string;
    messagesAdded: string[];
    messagesDeleted: string[];
    labelsAdded: { messageId: string; labelIds: string[] }[];
    labelsRemoved: { messageId: string; labelIds: string[] }[];
  }> {
    const gmail = this.getClient(auth);

    const messagesAdded: string[] = [];
    const messagesDeleted: string[] = [];
    const labelsAdded: { messageId: string; labelIds: string[] }[] = [];
    const labelsRemoved: { messageId: string; labelIds: string[] }[] = [];

    let pageToken: string | undefined;
    let latestHistoryId = startHistoryId;

    do {
      const response = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
        pageToken,
      });

      if (response.data.historyId) {
        latestHistoryId = response.data.historyId;
      }

      if (response.data.history) {
        for (const record of response.data.history) {
          if (record.messagesAdded) {
            for (const m of record.messagesAdded) {
              if (m.message?.id) messagesAdded.push(m.message.id);
            }
          }
          if (record.messagesDeleted) {
            for (const m of record.messagesDeleted) {
              if (m.message?.id) messagesDeleted.push(m.message.id);
            }
          }
          if (record.labelsAdded) {
            for (const m of record.labelsAdded) {
              if (m.message?.id && m.labelIds) {
                labelsAdded.push({ messageId: m.message.id, labelIds: m.labelIds });
              }
            }
          }
          if (record.labelsRemoved) {
            for (const m of record.labelsRemoved) {
              if (m.message?.id && m.labelIds) {
                labelsRemoved.push({ messageId: m.message.id, labelIds: m.labelIds });
              }
            }
          }
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return {
      historyId: latestHistoryId,
      messagesAdded: [...new Set(messagesAdded)],
      messagesDeleted: [...new Set(messagesDeleted)],
      labelsAdded,
      labelsRemoved,
    };
  }

  async searchMessages(
    auth: Auth.OAuth2Client,
    query: string,
    maxResults: number = 20
  ): Promise<Email[]> {
    const result = await this.getMessages(auth, { query, maxResults });
    return result.messages;
  }

  async markAsRead(auth: Auth.OAuth2Client, messageId: string): Promise<void> {
    await this.modifyMessage(auth, messageId, undefined, ['UNREAD']);
  }

  async markAsUnread(auth: Auth.OAuth2Client, messageId: string): Promise<void> {
    await this.modifyMessage(auth, messageId, ['UNREAD']);
  }

  async toggleStar(auth: Auth.OAuth2Client, messageId: string, starred: boolean): Promise<void> {
    if (starred) {
      await this.modifyMessage(auth, messageId, ['STARRED']);
    } else {
      await this.modifyMessage(auth, messageId, undefined, ['STARRED']);
    }
  }

  async toggleImportant(
    auth: Auth.OAuth2Client,
    messageId: string,
    important: boolean
  ): Promise<void> {
    if (important) {
      await this.modifyMessage(auth, messageId, ['IMPORTANT']);
    } else {
      await this.modifyMessage(auth, messageId, undefined, ['IMPORTANT']);
    }
  }

  // 첨부파일 다운로드
  async downloadAttachment(
    auth: Auth.OAuth2Client,
    messageId: string,
    attachmentId: string
  ): Promise<{ data: string; mimeType?: string }> {
    const gmail = this.getClient(auth);

    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    return {
      data: response.data.data || '',
    };
  }
}
