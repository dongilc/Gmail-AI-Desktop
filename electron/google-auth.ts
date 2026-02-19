import { google, Auth } from 'googleapis';
import { shell, app } from 'electron';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { Account } from '../src/types';

// OAuth 설정
const CREDENTIALS_PATH = path.join(__dirname, '../oauth/credentials.json');
const TOKENS_DIR = path.join(app.getPath('userData'), 'tokens');

// API 스코프 - Gmail, Calendar, Tasks 모두 포함
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// 로컬 콜백 서버 포트
const CALLBACK_PORT = 8085;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

interface Credentials {
  installed: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

export class GoogleAuth {
  private accounts: Map<string, Account> = new Map();
  private authClients: Map<string, Auth.OAuth2Client> = new Map();
  private credentials: Credentials | null = null;

  constructor() {
    this.loadCredentials();
    this.loadStoredTokens();
  }

  private loadCredentials(): void {
    try {
      const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      this.credentials = JSON.parse(content);
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
  }

  private getOAuth2Client(): Auth.OAuth2Client {
    if (!this.credentials) {
      throw new Error('Credentials not loaded');
    }

    const { client_id, client_secret } = this.credentials.installed;
    // 로컬 콜백 URI 사용
    return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
  }

  private loadStoredTokens(): void {
    if (!fs.existsSync(TOKENS_DIR)) {
      fs.mkdirSync(TOKENS_DIR, { recursive: true });
      return;
    }

    const files = fs.readdirSync(TOKENS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const tokenPath = path.join(TOKENS_DIR, file);
          const content = fs.readFileSync(tokenPath, 'utf-8');
          const tokenData = JSON.parse(content) as { account: Account; token: StoredToken };

          const auth = this.getOAuth2Client();
          auth.setCredentials(tokenData.token);

          this.accounts.set(tokenData.account.id, tokenData.account);
          this.authClients.set(tokenData.account.id, auth);
        } catch (error) {
          console.error(`Failed to load token from ${file}:`, error);
        }
      }
    }
  }

  private saveToken(account: Account, token: StoredToken): void {
    if (!fs.existsSync(TOKENS_DIR)) {
      fs.mkdirSync(TOKENS_DIR, { recursive: true });
    }

    const tokenPath = path.join(TOKENS_DIR, `${account.id}.json`);
    fs.writeFileSync(tokenPath, JSON.stringify({ account, token }, null, 2));
  }

  async login(): Promise<Account> {
    const auth = this.getOAuth2Client();

    const authUrl = auth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    return new Promise((resolve, reject) => {
      // 로컬 HTTP 서버로 콜백 받기
      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = url.parse(req.url || '', true);

          if (reqUrl.pathname === '/callback') {
            const code = reqUrl.query.code as string;

            if (code) {
              // 성공 페이지 표시
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>인증 완료</title></head>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>✅ 인증 완료!</h1>
                  <p>이 창을 닫고 Gmail Desktop으로 돌아가세요.</p>
                  <script>setTimeout(() => window.close(), 2000);</script>
                </body>
                </html>
              `);

              // 서버 종료
              server.close();

              // 토큰 교환
              const { tokens } = await auth.getToken(code);
              auth.setCredentials(tokens);

              // 사용자 정보 가져오기
              const oauth2 = google.oauth2({ version: 'v2', auth });
              const userInfo = await oauth2.userinfo.get();

              const account: Account = {
                id: userInfo.data.id!,
                email: userInfo.data.email!,
                name: userInfo.data.name || userInfo.data.email!,
                picture: userInfo.data.picture || undefined,
                accessToken: tokens.access_token!,
                refreshToken: tokens.refresh_token!,
                tokenExpiry: tokens.expiry_date!,
              };

              this.accounts.set(account.id, account);
              this.authClients.set(account.id, auth);
              this.saveToken(account, tokens as StoredToken);

              resolve(account);
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>인증 실패</title></head>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ 인증 실패</h1>
                  <p>다시 시도해주세요.</p>
                </body>
                </html>
              `);
              server.close();
              reject(new Error('No authorization code received'));
            }
          }
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>오류</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>❌ 오류 발생</h1>
              <p>${error}</p>
            </body>
            </html>
          `);
          server.close();
          reject(error);
        }
      });

      server.listen(CALLBACK_PORT, () => {
        console.log(`OAuth callback server listening on port ${CALLBACK_PORT}`);
        // 시스템 기본 브라우저로 인증 URL 열기
        shell.openExternal(authUrl);
      });

      // 타임아웃 설정 (5분)
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout'));
      }, 5 * 60 * 1000);
    });
  }

  async logout(accountId: string): Promise<void> {
    const auth = this.authClients.get(accountId);
    if (auth) {
      try {
        const token = auth.credentials.access_token;
        if (token) {
          await auth.revokeToken(token);
        }
      } catch (error) {
        console.error('Failed to revoke token:', error);
      }
    }

    this.accounts.delete(accountId);
    this.authClients.delete(accountId);

    // 저장된 토큰 파일 삭제
    const tokenPath = path.join(TOKENS_DIR, `${accountId}.json`);
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  }

  async getAccounts(): Promise<Account[]> {
    return Array.from(this.accounts.values());
  }

  async getAuthClient(accountId: string): Promise<Auth.OAuth2Client> {
    const auth = this.authClients.get(accountId);
    if (!auth) {
      throw new Error(`Account ${accountId} not found`);
    }

    // 토큰 만료 체크 및 갱신
    const credentials = auth.credentials;
    if (credentials.expiry_date && credentials.expiry_date < Date.now()) {
      await this.refreshToken(accountId);
    }

    return auth;
  }

  async refreshToken(accountId: string): Promise<string> {
    const auth = this.authClients.get(accountId);
    const account = this.accounts.get(accountId);

    if (!auth || !account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);

    // 계정 정보 업데이트
    account.accessToken = credentials.access_token!;
    account.tokenExpiry = credentials.expiry_date!;
    this.accounts.set(accountId, account);

    // 토큰 파일 업데이트
    this.saveToken(account, credentials as StoredToken);

    return credentials.access_token!;
  }
}
