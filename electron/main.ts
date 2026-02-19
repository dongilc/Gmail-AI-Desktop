import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GoogleAuth } from './google-auth';
import { GmailService } from './services/gmail-service';
import { CalendarService } from './services/calendar-service';
import { TasksService } from './services/tasks-service';
import { cacheService } from './services/cache-service';
import type { EmailSummary } from '../src/types';

// Avoid crashing when stdout/stderr pipe closes (e.g. parent process exits)
const handleBrokenPipe = (error: NodeJS.ErrnoException) => {
  if (error?.code !== 'EPIPE') {
    throw error;
  }
};

process.stdout?.on('error', handleBrokenPipe);
process.stderr?.on('error', handleBrokenPipe);

let mainWindow: BrowserWindow | null = null;
const googleAuth = new GoogleAuth();
const gmailService = new GmailService();
const calendarService = new CalendarService();
const tasksService = new TasksService();
const execFileAsync = promisify(execFile);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OLLAMA_TEMPERATURE = process.env.OLLAMA_TEMPERATURE
  ? Number(process.env.OLLAMA_TEMPERATURE)
  : 0.2;
const OLLAMA_NUM_PREDICT = process.env.OLLAMA_NUM_PREDICT
  ? Number(process.env.OLLAMA_NUM_PREDICT)
  : 1024;

let aiConfig = {
  baseUrl: OLLAMA_BASE_URL,
  model: OLLAMA_MODEL,
  temperature: OLLAMA_TEMPERATURE,
  numPredict: OLLAMA_NUM_PREDICT,
};

const weatherCache = new Map<string, { ts: number; text: string }>();
const newsCache = new Map<string, { ts: number; text: string }>();
const locationCache = new Map<string, { ts: number; results: any[] }>();
const WEATHER_TTL_MS = 10 * 60 * 1000;
const NEWS_TTL_MS = 30 * 60 * 1000;
const LOCATION_TTL_MS = 10 * 60 * 1000;

const attachCachedSummaries = <T extends { id: string; summary?: EmailSummary }>(
  accountId: string,
  emails: T[]
) => {
  const cached = cacheService.getEmails(accountId);
  if (!cached.length) return emails;
  const summaryMap = new Map(cached.map((email) => [email.id, email.summary]));
  return emails.map((email) => {
    if (email.summary) return email;
    const summary = summaryMap.get(email.id);
    return summary ? { ...email, summary } : email;
  });
};

const WEATHER_CODE_LABELS: Record<number, { ko: string; en: string }> = {
  0: { ko: '\uB9D1\uC74C', en: 'Clear' },
  1: { ko: '\uB300\uCCB4\uB85C \uB9D1\uC74C', en: 'Mostly clear' },
  2: { ko: '\uBD80\uBD84\uC801\uC73C\uB85C \uD750\uB9BC', en: 'Partly cloudy' },
  3: { ko: '\uD750\uB9BC', en: 'Overcast' },
  45: { ko: '\uC548\uAC1C', en: 'Fog' },
  48: { ko: '\uC11C\uB9AC\uB09C \uC548\uAC1C', en: 'Depositing rime fog' },
  51: { ko: '\uBC18\uC0AD\uAC70\uB9BC \uBE44(\uC57D)', en: 'Drizzle (light)' },
  53: { ko: '\uBC18\uC0AD\uAC70\uB9BC \uBE44(\uBCF4\uD1B5)', en: 'Drizzle (moderate)' },
  55: { ko: '\uBC18\uC0AD\uAC70\uB9BC \uBE44(\uAC15)', en: 'Drizzle (dense)' },
  56: { ko: '\uC5BC\uC74C\uBE44(\uC57D)', en: 'Freezing drizzle (light)' },
  57: { ko: '\uC5BC\uC74C\uBE44(\uAC15)', en: 'Freezing drizzle (dense)' },
  61: { ko: '\uBE44(\uC57D)', en: 'Rain (light)' },
  63: { ko: '\uBE44(\uBCF4\uD1B5)', en: 'Rain (moderate)' },
  65: { ko: '\uBE44(\uAC15)', en: 'Rain (heavy)' },
  66: { ko: '\uC5BC\uC74C\uBE44(\uC57D)', en: 'Freezing rain (light)' },
  67: { ko: '\uC5BC\uC74C\uBE44(\uAC15)', en: 'Freezing rain (heavy)' },
  71: { ko: '\uB208(\uC57D)', en: 'Snow (light)' },
  73: { ko: '\uB208(\uBCF4\uD1B5)', en: 'Snow (moderate)' },
  75: { ko: '\uB208(\uAC15)', en: 'Snow (heavy)' },
  77: { ko: '\uB208 \uC785\uC790', en: 'Snow grains' },
  80: { ko: '\uC18C\uB098\uAE30(\uC57D)', en: 'Rain showers (light)' },
  81: { ko: '\uC18C\uB098\uAE30(\uBCF4\uD1B5)', en: 'Rain showers (moderate)' },
  82: { ko: '\uC18C\uB098\uAE30(\uAC15)', en: 'Rain showers (violent)' },
  85: { ko: '\uB208 \uC18C\uB098\uAE30(\uC57D)', en: 'Snow showers (light)' },
  86: { ko: '\uB208 \uC18C\uB098\uAE30(\uAC15)', en: 'Snow showers (heavy)' },
  95: { ko: '\uB1CC\uAC1C', en: 'Thunderstorm' },
  96: { ko: '\uB1CC\uAC1C(\uC6B0\uBC15)', en: 'Thunderstorm with hail' },
  99: { ko: '\uAC15\uD55C \uB1CC\uAC1C(\uC6B0\uBC15)', en: 'Thunderstorm with heavy hail' },
};


const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const stripCdata = (value: string) =>
  value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');

const extractRssTitles = (xml: string, maxItems = 5) => {
  const items: string[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) && items.length < maxItems) {
    const item = match[1];
    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
    if (!titleMatch) continue;
    const rawTitle = stripCdata(titleMatch[1]).trim();
    const decoded = decodeHtmlEntities(rawTitle).trim();
    let clean = decoded.replace(/\s+-\s+[^-]+$/, '').trim();
    if (clean.length < 4) {
      clean = decoded;
    }
    if (!clean) continue;
    if (!items.includes(clean)) {
      items.push(clean);
    }
  }
  return items;
};

const fetchLocationSuggestions = async (query: string, lang: 'ko' | 'en') => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cacheKey = `${lang}:${trimmed}`.toLowerCase();
  const cached = locationCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LOCATION_TTL_MS) {
    return cached.results;
  }
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    trimmed
  )}&count=6&language=${lang}&format=json`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) {
    throw new Error(`Location search failed: ${geoRes.status}`);
  }
  const geo = await geoRes.json();
  const results = Array.isArray(geo?.results)
    ? geo.results.map((item: any) => ({
        name: item.name,
        admin1: item.admin1,
        country: item.country,
        latitude: item.latitude,
        longitude: item.longitude,
      }))
    : [];
  locationCache.set(cacheKey, { ts: Date.now(), results });
  return results;
};

const fetchWeatherSummary = async (
  location: string,
  lang: 'ko' | 'en',
  coords?: { latitude: number; longitude: number }
) => {
  const coordsKey = coords ? `${coords.latitude},${coords.longitude}` : '';
  const cacheKey = `${lang}:${coordsKey || location}`.toLowerCase();
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < WEATHER_TTL_MS) {
    return cached.text;
  }

  let latitude = coords?.latitude;
  let longitude = coords?.longitude;
  let locationLabel = location;

  if (latitude === undefined || longitude === undefined) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      location
    )}&count=1&language=${lang}&format=json`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) {
      throw new Error(`Weather geocode failed: ${geoRes.status}`);
    }
    const geo = await geoRes.json();
    const place = geo?.results?.[0];
    if (!place) {
      return lang === 'ko' ? '\uC704\uCE58\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.' : 'Location not found.';
    }
    latitude = place.latitude;
    longitude = place.longitude;
    locationLabel = place.name || place.admin1 || location;
  }

  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm10,pm2_5,us_aqi&timezone=auto`;
  const forecastRes = await fetch(forecastUrl);
  if (!forecastRes.ok) {
    throw new Error(`Weather forecast failed: ${forecastRes.status}`);
  }
  const forecast = await forecastRes.json();
  let air: any = null;
  try {
    const airRes = await fetch(airUrl);
    if (airRes.ok) {
      air = await airRes.json();
    }
  } catch {
    air = null;
  }
  const current = forecast?.current || {};
  const daily = forecast?.daily || {};
  const temp = current.temperature_2m;
  const code = current.weather_code;
  const desc = WEATHER_CODE_LABELS[Number(code)]?.[lang] || (lang === 'ko' ? '\uC54C \uC218 \uC5C6\uC74C' : 'Unknown');
  const max = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : undefined;
  const min = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : undefined;
  const precip = Array.isArray(daily.precipitation_probability_max)
    ? daily.precipitation_probability_max[0]
    : undefined;

  const airCurrent = air?.current || {};
  const pm10 = airCurrent.pm10;
  const pm2_5 = airCurrent.pm2_5;

  const gradePm10Ko = (value: number) =>
    value <= 30 ? '\uC88B\uC74C' : value <= 80 ? '\uBCF4\uD1B5' : value <= 150 ? '\uB098\uC068' : '\uB9E4\uC6B0 \uB098\uC068';
  const gradePm25Ko = (value: number) =>
    value <= 15 ? '\uC88B\uC74C' : value <= 35 ? '\uBCF4\uD1B5' : value <= 75 ? '\uB098\uC068' : '\uB9E4\uC6B0 \uB098\uC068';
  const gradePm10En = (value: number) =>
    value <= 30 ? 'Good' : value <= 80 ? 'Moderate' : value <= 150 ? 'Unhealthy' : 'Very unhealthy';
  const gradePm25En = (value: number) =>
    value <= 15 ? 'Good' : value <= 35 ? 'Moderate' : value <= 75 ? 'Unhealthy' : 'Very unhealthy';

  const pm10LineKo =
    pm10 !== undefined
      ? `\uBBF8\uC138\uBA3C\uC9C0(PM10) ${pm10} ug/m3 (${gradePm10Ko(pm10)})`
      : '\uBBF8\uC138\uBA3C\uC9C0(PM10) \uB370\uC774\uD130 \uC5C6\uC74C';
  const pm25LineKo =
    pm2_5 !== undefined
      ? `\uCD08\uBBF8\uC138\uBA3C\uC9C0(PM2.5) ${pm2_5} ug/m3 (${gradePm25Ko(pm2_5)})`
      : '\uCD08\uBBF8\uC138\uBA3C\uC9C0(PM2.5) \uB370\uC774\uD130 \uC5C6\uC74C';
  const pm10LineEn =
    pm10 !== undefined ? `PM10 ${pm10} ug/m3 (${gradePm10En(pm10)})` : 'PM10 data unavailable';
  const pm25LineEn =
    pm2_5 !== undefined ? `PM2.5 ${pm2_5} ug/m3 (${gradePm25En(pm2_5)})` : 'PM2.5 data unavailable';

  let text = '';
  if (lang === 'ko') {
    const lines: string[] = [];
    lines.push(`${locationLabel}`);
    lines.push(`- \uD604\uC7AC ${temp ?? '-'}\u00B0C, ${desc}`);
    if (max !== undefined) {
      lines.push(`- \uCD5C\uACE0 ${max}\u00B0C`);
    }
    if (min !== undefined) {
      lines.push(`- \uCD5C\uC800 ${min}\u00B0C`);
    }
    if (precip !== undefined) {
      lines.push(`- \uAC15\uC218\uD655\uB960 ${precip}%`);
    }
    lines.push(`- ${pm10LineKo}`);
    lines.push(`- ${pm25LineKo}`);
    text = lines.join('\n');
  } else {
    const lines: string[] = [];
    lines.push(`${locationLabel}`);
    lines.push(`- Now ${temp ?? '-'}\u00B0C, ${desc}`);
    if (max !== undefined) {
      lines.push(`- High ${max}\u00B0C`);
    }
    if (min !== undefined) {
      lines.push(`- Low ${min}\u00B0C`);
    }
    if (precip !== undefined) {
      lines.push(`- Precip ${precip}%`);
    }
    lines.push(`- ${pm10LineEn}`);
    lines.push(`- ${pm25LineEn}`);
    text = lines.join('\n');
  }

  weatherCache.set(cacheKey, { ts: Date.now(), text });
  return text;
};

const fetchNewsSummary = async (keyword: string, lang: 'ko' | 'en', force = false) => {
  const effectiveKeyword = keyword.trim() || (lang === 'en' ? 'world news' : '국제 뉴스');
  const cacheKey = `${lang}:${effectiveKeyword}`.toLowerCase();
  const cached = newsCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.ts < NEWS_TTL_MS) {
    return cached.text;
  }

  const normalizeKeyword = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  const normalizedKeyword = normalizeKeyword(effectiveKeyword);
  const isGenericKeyword = lang === 'ko'
    ? ['국제', '국제이슈', '국제뉴스', '세계', '세계뉴스'].includes(normalizedKeyword)
    : ['world', 'worldnews', 'global', 'international'].includes(normalizedKeyword);

  const buildSearchUrl = (query: string) =>
    lang === 'ko'
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`
      : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const topicUrl =
    lang === 'ko'
      ? 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=ko&gl=KR&ceid=KR:ko'
      : 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en';

  const normalizeTitles = (titles: string[]) => {
    const seen = new Set<string>();
    return titles
      .map((title) => title.trim())
      .filter(Boolean)
      .filter((title) => {
        if (title.length < 4) return false;
        const compact = title.replace(/\s+/g, '').toLowerCase();
        if (['국제', '세계', 'world', 'news', '뉴스', '국제이슈'].includes(compact)) {
          return false;
        }
        return true;
      })
      .filter((title) => {
        const key = title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const fetchTitles = async (url: string, maxItems = 8) => {
    const rssRes = await fetch(url);
    if (!rssRes.ok) {
      throw new Error(`News RSS failed: ${rssRes.status}`);
    }
    const xml = await rssRes.text();
    return extractRssTitles(xml, maxItems);
  };

  const query = force ? `${effectiveKeyword} when:1d` : effectiveKeyword;
  let titles: string[] = [];

  if (!isGenericKeyword) {
    try {
      titles = await fetchTitles(buildSearchUrl(query));
    } catch (error) {
      console.error('News RSS fetch failed:', error);
    }

    if (titles.length === 0 && force && query.includes('when:1d')) {
      try {
        titles = await fetchTitles(buildSearchUrl(effectiveKeyword));
      } catch (error) {
        console.error('News RSS fallback failed:', error);
      }
    }
  }

  titles = normalizeTitles(titles);

  if (isGenericKeyword || titles.length < 2) {
    try {
      titles = normalizeTitles(await fetchTitles(topicUrl));
    } catch (error) {
      console.error('News RSS topic fallback failed:', error);
    }
  }

  const text =
    titles.length > 0
      ? titles.slice(0, 5).map((t) => `- ${t}`).join('\n')
      : lang === 'ko'
        ? '없음'
        : 'None';

  newsCache.set(cacheKey, { ts: Date.now(), text });
  return text;
};

const stripHtml = (html: string): string =>
  html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildSummaryPrompt = (subject: string, from: string, body: string): string => {
  return [
    '당신은 이메일 요약기입니다.',
    '다음 이메일을 한국어로 2~3줄로 요약하세요.',
    '중복 표현 없이 핵심만 간단히 정리하고, 줄바꿈으로 구분하세요.',
    '아래 규칙을 반드시 지키세요:',
    '- 요약 시작에 "이메일 요약", "요약은 다음과 같습니다", "다음과 같이 요약" 등 서두 문구를 쓰지 말 것',
    '- 바로 핵심 내용으로 시작할 것',
    '- 번호/불릿 없이 문장만 출력할 것',
    '',
    `제목: ${subject || '(제목 없음)'}`,
    `보낸 사람: ${from || '-'}`,
    '본문:',
    body,
  ].join('\n');
};

const callOllamaGenerate = async (
  prompt: string,
  format?: 'json'
): Promise<{ text: string; promptTokens: number; evalTokens: number }> => {
  const response = await fetch(`${aiConfig.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiConfig.model,
      prompt,
      stream: false,
      ...(format ? { format } : {}),
      options: {
        temperature: aiConfig.temperature,
        num_predict: aiConfig.numPredict,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const payload = {
    text: typeof data?.response === 'string' ? data.response : '',
    promptTokens: typeof data?.prompt_eval_count === 'number' ? data.prompt_eval_count : 0,
    evalTokens: typeof data?.eval_count === 'number' ? data.eval_count : 0,
  };
  console.log('[Ollama] token usage', {
    promptTokens: payload.promptTokens,
    evalTokens: payload.evalTokens,
    total: payload.promptTokens + payload.evalTokens,
  });
  return payload;
};

const callOllamaSummary = async (prompt: string): Promise<{ text: string; promptTokens: number; evalTokens: number }> =>
  callOllamaGenerate(prompt);

const buildSchedulePrompt = (text: string, baseDateIso?: string): string => {
  const baseDate = baseDateIso ? new Date(baseDateIso) : new Date();
  const baseLocal = [
    baseDate.getFullYear(),
    String(baseDate.getMonth() + 1).padStart(2, '0'),
    String(baseDate.getDate()).padStart(2, '0'),
  ].join('-');
  return [
    'You are a calendar event parser.',
    'Return ONLY valid JSON.',
    'Keys: title, location, startLocal, endLocal, allDay.',
    "startLocal/endLocal must be local time in format 'YYYY-MM-DDTHH:MM'.",
    'If time is missing, infer 09:00-10:00 and set allDay=false.',
    'If clearly all-day, set allDay=true and use 00:00 and 23:59.',
    `Base date: ${baseLocal}`,
    `Text: ${text}`,
  ].join('\n');
};

const listOllamaModels = async (): Promise<string[]> => {
  const response = await fetch(`${aiConfig.baseUrl}/api/tags`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama tags error: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { models?: Array<{ name?: string }> };
  return (data.models ?? [])
    .map((model) => model.name)
    .filter((name): name is string => Boolean(name));
};

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function normalizeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
}

const findLibreOfficeBinary = async (): Promise<string | null> => {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
          'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        ]
      : process.platform === 'darwin'
      ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice']
      : ['/usr/bin/libreoffice', '/usr/bin/soffice', '/snap/bin/libreoffice'];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }

  try {
    await execFileAsync('soffice', ['--version'], { timeout: 3000 });
    return 'soffice';
  } catch {
    // ignore
  }
  try {
    await execFileAsync('libreoffice', ['--version'], { timeout: 3000 });
    return 'libreoffice';
  } catch {
    // ignore
  }

  return null;
};

function createWindow() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  mainWindow = new BrowserWindow({
    width: 1800,
    height: 1080,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      plugins: true,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // 이메일 이미지 로딩을 위한 CSP 헤더 설정
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http:; " +
            "img-src 'self' data: blob: https: http: *; " +
            "style-src 'self' 'unsafe-inline' https: http:; " +
            "font-src 'self' data: https: http:;"
        ]
      : [
          "default-src 'self'; " +
            "script-src 'self'; " +
            "img-src 'self' data: blob: https: http:; " +
            "style-src 'self' 'unsafe-inline' https: http:; " +
            "font-src 'self' data: https: http:;"
        ];

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': csp
      }
    });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // 개발자 도구는 필요시 View -> Toggle Developer Tools 메뉴로 열기
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 외부 링크는 기본 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 앱 내 링크 클릭시 외부 브라우저로 열기
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 개발 서버 URL이 아닌 경우 외부 브라우저로
    if (!url.startsWith('http://localhost:')) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });

  // a 태그 클릭 처리 (target이 없는 경우도 포함)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript(`
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (link) {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            e.preventDefault();
            window.electronAPI?.openExternal?.(href);
          }
        }
      });
    `);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ===== IPC Handlers =====

// Shell handlers
ipcMain.handle('shell:open-external', async (_, url: string) => {
  if (isSafeExternalUrl(url)) {
    await shell.openExternal(url);
  }
});

// Auth handlers
ipcMain.handle('auth:login', async () => {
  return await googleAuth.login();
});

ipcMain.handle('auth:logout', async (_, accountId: string) => {
  return await googleAuth.logout(accountId);
});

ipcMain.handle('auth:get-accounts', async () => {
  return await googleAuth.getAccounts();
});

ipcMain.handle('auth:refresh-token', async (_, accountId: string) => {
  return await googleAuth.refreshToken(accountId);
});

// Gmail handlers

// 저장소에서 즉시 읽기 (API 호출 없음)
ipcMain.handle('gmail:get-messages', async (_, accountId: string, options: any) => {
  const allEmails = cacheService.getEmails(accountId);

  // labelIds에 따라 필터링
  let filtered = allEmails;
  if (options.labelIds && options.labelIds.length > 0) {
    filtered = allEmails.filter(email => {
      return options.labelIds.every((labelId: string) => {
        switch (labelId) {
          case 'INBOX':
            return email.labels.includes('INBOX');
          case 'UNREAD':
            return !email.isRead;
          case 'STARRED':
            return email.isStarred;
          case 'IMPORTANT':
            return email.isImportant;
          case 'SENT':
            return email.labels.includes('SENT');
          case 'DRAFT':
            return email.labels.includes('DRAFT');
          case 'TRASH':
            return email.labels.includes('TRASH');
          default:
            return email.labels.includes(labelId);
        }
      });
    });
  }

  const labelIds = options?.labelIds as string[] | undefined;
  const isInboxOnly = !!labelIds && labelIds.length === 1 && labelIds[0] === 'INBOX';

  const isDraftsView = !!labelIds && labelIds.includes('DRAFT');

  // Always fetch drafts from the server to avoid stale cache.
  if (isDraftsView) {
    const auth = await googleAuth.getAuthClient(accountId);
    const result = await gmailService.getMessages(auth, {
      labelIds,
      maxResults: options?.maxResults || 50,
      pageToken: options?.pageToken,
      query: options?.query,
    });

    const emailsToCache = result.messages.map((email: any) => ({
      ...email,
      accountId,
      date: email.date instanceof Date ? email.date.toISOString() : email.date,
    }));

    const mergedDrafts = attachCachedSummaries(accountId, emailsToCache);
    const withoutDrafts = allEmails.filter((email) => !email.labels.includes('DRAFT'));
    cacheService.saveEmails(accountId, [...mergedDrafts, ...withoutDrafts]);

    console.log(`[Store] Synced drafts ${emailsToCache.length} for ${accountId}`);
    return {
      messages: mergedDrafts,
      nextPageToken: result.nextPageToken,
    };
  }

  // 캐시에 없고 인박스 외 뷰면 원격에서 가져와 캐시에 합치기
  if (filtered.length === 0 && labelIds && labelIds.length > 0 && !isInboxOnly) {
    const auth = await googleAuth.getAuthClient(accountId);
    const result = await gmailService.getMessages(auth, {
      labelIds,
      maxResults: options?.maxResults || 50,
      pageToken: options?.pageToken,
      query: options?.query,
    });

    const emailsToCache = result.messages.map((email: any) => ({
      ...email,
      accountId,
      date: email.date instanceof Date ? email.date.toISOString() : email.date,
    }));
    const mergedRemote = attachCachedSummaries(accountId, emailsToCache);

    if (mergedRemote.length > 0) {
      cacheService.saveEmails(accountId, mergedRemote, true);
    }

    console.log(`[Store] Fetched ${emailsToCache.length} emails remotely for ${accountId} labels=${labelIds.join(',')}`);
    return {
      messages: mergedRemote,
      nextPageToken: result.nextPageToken,
    };
  }

  console.log(`[Store] Returning ${filtered.length} emails for ${accountId} (total: ${allEmails.length})`);
  return {
    messages: filtered,
    nextPageToken: undefined,
  };
});

// 동기화 핸들러: 전체 동기화 또는 증분 동기화
ipcMain.handle('gmail:sync', async (_, accountId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  const savedHistoryId = cacheService.getHistoryId(accountId);

  if (savedHistoryId) {
    // 증분 동기화 시도
    try {
      return await performIncrementalSync(accountId, auth, savedHistoryId);
    } catch (error: any) {
      // historyId 만료 (404/410) → 전체 동기화 fallback
      if (error?.code === 404 || error?.code === 410 ||
          error?.response?.status === 404 || error?.response?.status === 410) {
        console.log(`[Sync] HistoryId expired for ${accountId}, falling back to full sync`);
        return await performFullSync(accountId, auth);
      }
      throw error;
    }
  } else {
    // historyId 없음 → 전체 동기화
    return await performFullSync(accountId, auth);
  }
});

async function performFullSync(accountId: string, auth: any) {
  console.log(`[Sync] Starting full sync for ${accountId}`);

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  let allEmails: any[] = [];
  let nextPageToken: string | undefined;
  let hasEnoughEmails = false;

  while (!hasEnoughEmails) {
    const result = await gmailService.getMessages(auth, {
      labelIds: ['INBOX'],
      maxResults: 50,
      pageToken: nextPageToken,
    });

    const emailsToCache = result.messages.map((email: any) => ({
      ...email,
      accountId,
      date: email.date instanceof Date ? email.date.toISOString() : email.date,
    }));

    allEmails = [...allEmails, ...emailsToCache];
    nextPageToken = result.nextPageToken;

    if (allEmails.length > 0) {
      const oldestEmail = allEmails[allEmails.length - 1];
      const oldestDate = new Date(oldestEmail.date);
      if (oldestDate < twoWeeksAgo || !nextPageToken) {
        hasEnoughEmails = true;
      }
    } else {
      hasEnoughEmails = true;
    }

    if (allEmails.length >= 2000) {
      hasEnoughEmails = true;
    }
  }

  // 저장소에 저장
  const mergedEmails = attachCachedSummaries(accountId, allEmails);
  cacheService.saveEmails(accountId, mergedEmails);

  // 현재 historyId 저장
  const profile = await gmailService.getProfile(auth);
  cacheService.saveHistoryId(accountId, profile.historyId);
  cacheService.setInitialSyncComplete(accountId, true);

  console.log(`[Sync] Full sync complete: ${allEmails.length} emails, historyId=${profile.historyId}`);
  return { type: 'full', emailCount: allEmails.length };
}

async function performIncrementalSync(accountId: string, auth: any, startHistoryId: string) {
  console.log(`[Sync] Starting incremental sync for ${accountId} from historyId=${startHistoryId}`);

  const history = await gmailService.getHistory(auth, startHistoryId);

  // 삭제된 메일 제거
  if (history.messagesDeleted.length > 0) {
    cacheService.removeEmails(accountId, history.messagesDeleted);
    console.log(`[Sync] Removed ${history.messagesDeleted.length} deleted messages`);
  }

  // 라벨 변경 적용
  for (const change of history.labelsAdded) {
    cacheService.updateEmailLabels(accountId, change.messageId, change.labelIds, []);
  }
  for (const change of history.labelsRemoved) {
    cacheService.updateEmailLabels(accountId, change.messageId, [], change.labelIds);
  }

  // 새 메일 추가 (삭제된 것은 제외)
  const deletedSet = new Set(history.messagesDeleted);
  const newMessageIds = history.messagesAdded.filter(id => !deletedSet.has(id));

  // 이미 저장소에 있는 메일은 제외
  const existingIds = new Set(cacheService.getEmails(accountId).map(e => e.id));
  const toFetch = newMessageIds.filter(id => !existingIds.has(id));

  if (toFetch.length > 0) {
    // 새 메일 상세 정보 가져오기 (배치로)
    const batchSize = 10;
    const newEmails: any[] = [];
    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(id => gmailService.getMessagePreview(auth, id).catch(() => null))
      );
      for (const email of results) {
        if (email) {
          newEmails.push({
            ...email,
            accountId,
            date: email.date instanceof Date ? email.date.toISOString() : email.date,
          });
        }
      }
    }

    if (newEmails.length > 0) {
      cacheService.addEmails(accountId, newEmails);
      console.log(`[Sync] Added ${newEmails.length} new messages`);
    }
  }

  // historyId 업데이트
  cacheService.saveHistoryId(accountId, history.historyId);
  cacheService.savePageToken(accountId, undefined);

  const labelChanges = history.labelsAdded.length + history.labelsRemoved.length;
  console.log(`[Sync] Incremental sync complete: +${toFetch.length} -${history.messagesDeleted.length} labels:${labelChanges}`);
  return {
    type: 'incremental',
    added: toFetch.length,
    deleted: history.messagesDeleted.length,
    labelChanges,
  };
}

ipcMain.handle('gmail:get-message', async (_, accountId: string, messageId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  const email = await gmailService.getMessage(auth, messageId);
  const cachedSummary = cacheService.getEmails(accountId).find((item) => item.id === messageId)?.summary;

  // Cache update
  const mergedEmail = {
    ...email,
    accountId,
    date: email.date instanceof Date ? email.date.toISOString() : email.date,
    summary: cachedSummary ?? (email as any)?.summary,
  };
  cacheService.updateEmail(accountId, mergedEmail as any);

  return mergedEmail;
});

ipcMain.handle('gmail:send-message', async (_, accountId: string, draft: any) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await gmailService.sendMessage(auth, draft);
});

ipcMain.handle('gmail:create-draft', async (_, accountId: string, draft: any) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await gmailService.createDraft(auth, draft);
});

ipcMain.handle('gmail:update-draft', async (_, accountId: string, draftId: string, draft: any) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await gmailService.updateDraft(auth, draftId, draft);
});

ipcMain.handle('gmail:delete-draft', async (_, accountId: string, draftId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  try {
    return await gmailService.deleteDraft(auth, draftId);
  } catch (error: any) {
    const status =
      error?.response?.status ?? error?.status ?? error?.code ?? error?.response?.statusCode;
    const notFound = status === 404 || error?.errors?.some((err: any) => err?.reason === 'notFound');
    if (notFound) {
      return;
    }
    throw error;
  }
});

ipcMain.handle('gmail:modify-message', async (_, accountId: string, messageId: string, addLabels?: string[], removeLabels?: string[]) => {
  const auth = await googleAuth.getAuthClient(accountId);
  const result = await gmailService.modifyMessage(auth, messageId, addLabels, removeLabels);

  // 저장소 업데이트 (라벨 배열 포함)
  cacheService.updateEmailLabels(
    accountId,
    messageId,
    addLabels || [],
    removeLabels || []
  );

  return result;
});

ipcMain.handle('gmail:trash-message', async (_, accountId: string, messageId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  const result = await gmailService.trashMessage(auth, messageId);

  // 캐시에서도 삭제
  cacheService.removeEmail(accountId, messageId);

  return result;
});

// 캐시 관련 핸들러
ipcMain.handle('cache:refresh', async (_, accountId: string) => {
  // 캐시 무효화하고 새로 가져오기
  cacheService.clearAccount(accountId);
  console.log(`[Cache] Cleared cache for ${accountId}`);
});

ipcMain.handle('cache:clear-all', async () => {
  cacheService.clearAll();
  console.log('[Cache] Cleared all cache');
});

ipcMain.handle('cache:get-info', async (_, accountId: string) => {
  return {
    emailCount: cacheService.getEmails(accountId).length,
    lastSync: cacheService.getLastSync(accountId),
    historyId: cacheService.getHistoryId(accountId),
    initialSyncComplete: cacheService.isInitialSyncComplete(accountId),
  };
});

ipcMain.handle('gmail:search', async (_, accountId: string, query: string, maxResults: number = 20) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await gmailService.searchMessages(auth, query, maxResults);
});

// 첨부파일 데이터 가져오기 (인라인 이미지용)
ipcMain.handle('gmail:get-attachment', async (_, accountId: string, messageId: string, attachmentId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  const result = await gmailService.downloadAttachment(auth, messageId, attachmentId);
  // base64 URL-safe를 일반 base64로 변환
  const data = normalizeBase64Url(result.data);
  return { data };
});

ipcMain.handle('gmail:download-attachment', async (_, accountId: string, messageId: string, attachmentId: string, filename: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  const result = await gmailService.downloadAttachment(auth, messageId, attachmentId);

  // 파일 저장 다이얼로그 표시
  const { dialog } = await import('electron');
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });

  if (!canceled && filePath) {
    const fs = await import('fs');
    // base64 URL-safe 디코딩
    const data = normalizeBase64Url(result.data);
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true, path: filePath };
  }

  return { success: false };
});

ipcMain.handle(
  'gmail:preview-office-attachment',
  async (_, accountId: string, messageId: string, attachmentId: string, filename: string) => {
    const auth = await googleAuth.getAuthClient(accountId);
    const result = await gmailService.downloadAttachment(auth, messageId, attachmentId);
    const sofficePath = await findLibreOfficeBinary();
    if (!sofficePath) {
      return { ok: false, reason: 'no_converter' };
    }

    const data = normalizeBase64Url(result.data);
    const buffer = Buffer.from(data, 'base64');
    const safeName = (filename || `attachment-${Date.now()}`).replace(/[\\/:*?"<>|]+/g, '_');
    const tmpDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'gmail-office-'));
    const inputPath = path.join(tmpDir, safeName);

    try {
      await fs.writeFile(inputPath, buffer);
      await execFileAsync(
        sofficePath,
        ['--headless', '--nologo', '--nofirststartwizard', '--convert-to', 'pdf', '--outdir', tmpDir, inputPath],
        { timeout: 30000 }
      );
      const files = await fs.readdir(tmpDir);
      const pdfFile = files.find((file) => file.toLowerCase().endsWith('.pdf'));
      if (!pdfFile) {
        return { ok: false, reason: 'convert_failed' };
      }
      const pdfBuffer = await fs.readFile(path.join(tmpDir, pdfFile));
      return { ok: true, data: pdfBuffer.toString('base64'), filename: pdfFile };
    } catch (error) {
      console.error('Office preview failed:', error);
      return { ok: false, reason: 'convert_failed' };
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
);

// Calendar handlers
ipcMain.handle('calendar:get-events', async (_, accountId: string, timeMin: string, timeMax: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await calendarService.getEvents(auth, new Date(timeMin), new Date(timeMax));
});

ipcMain.handle('calendar:create-event', async (_, accountId: string, event: any) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await calendarService.createEvent(auth, event);
});

ipcMain.handle('calendar:update-event', async (_, accountId: string, event: any) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await calendarService.updateEvent(auth, event);
});

ipcMain.handle('calendar:delete-event', async (_, accountId: string, eventId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await calendarService.deleteEvent(auth, eventId);
});

// Tasks handlers
ipcMain.handle('tasks:get-lists', async (_, accountId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await tasksService.getTaskLists(auth);
});

ipcMain.handle('tasks:get-tasks', async (_, accountId: string, taskListId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await tasksService.getTasks(auth, taskListId);
});

ipcMain.handle('tasks:create-task', async (_, accountId: string, taskListId: string, task: any) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await tasksService.createTask(auth, taskListId, task);
});

ipcMain.handle('tasks:update-task', async (_, accountId: string, taskListId: string, task: any) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await tasksService.updateTask(auth, taskListId, task);
});

ipcMain.handle('tasks:delete-task', async (_, accountId: string, taskListId: string, taskId: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await tasksService.deleteTask(auth, taskListId, taskId);
});

ipcMain.handle('tasks:move-task', async (_, accountId: string, taskListId: string, taskId: string, previousTaskId?: string) => {
  const auth = await googleAuth.getAuthClient(accountId);
  return await tasksService.moveTask(auth, taskListId, taskId, previousTaskId);
});

// AI summary (Ollama)
ipcMain.handle('ai:summarize-email', async (_, accountId: string, emailId: string) => {
  const cached = cacheService.getEmails(accountId);
  let email = cached.find(e => e.id === emailId);
  const hadCached = !!email;

  if (!email || !email.body) {
    const auth = await googleAuth.getAuthClient(accountId);
    const fullEmail = await gmailService.getMessage(auth, emailId);
    email = {
      ...fullEmail,
      accountId,
      date: fullEmail.date instanceof Date ? fullEmail.date.toISOString() : (fullEmail as any).date,
    } as any;
    if (hadCached) {
      cacheService.updateEmail(accountId, email);
    } else {
      cacheService.addEmails(accountId, [email]);
    }
  }

  const subject = email?.subject || '';
  const from = email?.from?.name || email?.from?.email || '';
  const rawBody = email?.body || stripHtml(email?.bodyHtml || '') || email?.snippet || '';
  const trimmedBody = rawBody.slice(0, 6000);
  const prompt = buildSummaryPrompt(subject, from, trimmedBody);

  let responseText = '';
  let promptTokens = 0;
  let evalTokens = 0;

  // 본문이 너무 짧으면 요약 생략
  if (trimmedBody.length < 20) {
    console.warn('[AI요약] 본문이 너무 짧음:', emailId, trimmedBody.length, '자');
    return {
      summaryLines: [],
      actions: [],
      generatedAt: new Date().toISOString(),
      promptTokens: 0,
      evalTokens: 0,
    };
  }

  try {
    const result = await callOllamaSummary(prompt);
    responseText = result.text;
    promptTokens = result.promptTokens;
    evalTokens = result.evalTokens;
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch failed')) {
      console.error('[AI요약] Ollama 연결 실패 - Ollama가 실행 중인지 확인하세요:', errorMsg);
    } else {
      console.error('[AI요약] 요약 생성 실패:', errorMsg);
    }
    return {
      summaryLines: [],
      actions: [],
      generatedAt: new Date().toISOString(),
      promptTokens: 0,
      evalTokens: 0,
    };
  }
  const cleaned = responseText
    .replace(/^(AI\s*요약|요약|이메일\s*요약|이메일의?\s*요약)\s*[:\-]\s*/gim, '')
    .replace(/^(이메일의?\s*요약은\s*다음과\s*같습니다)\s*[:\-]?\s*/gim, '')
    .replace(/^(다음과\s*같이\s*이메일의?\s*주요\s*내용을\s*요약하였?습니다)\s*[:\-]?\s*/gim, '')
    .replace(/^(요약은\s*다음과\s*같습니다)\s*[:\-]?\s*/gim, '')
    .replace(/^(Summary|TL;DR)\s*[:\-]\s*/gim, '')
    .replace(/\b(이메일\s*요약|이메일의?\s*요약|이메일의?\s*요약은\s*다음과\s*같습니다|다음과\s*같이\s*이메일의?\s*주요\s*내용을\s*요약하였?습니다|요약은\s*다음과\s*같습니다|Summary|TL;DR)\b\s*[:：\-]?\s*/gim, '')
    .trim();

  const summaryLines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

  const summary = {
    summaryLines,
    actions: [],
    generatedAt: new Date().toISOString(),
    promptTokens,
    evalTokens,
  };

  if (email) {
    const updated = { ...email, summary } as any;
    if (hadCached) {
      cacheService.updateEmail(accountId, updated);
    } else {
      cacheService.addEmails(accountId, [updated]);
    }
  }

  return summary;
});

ipcMain.handle('ai:health', async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${aiConfig.baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: response.ok };
  } catch {
    clearTimeout(timeout);
    return { ok: false };
  }
});

ipcMain.handle('ai:set-config', async (_, config: Partial<typeof aiConfig>) => {
  aiConfig = {
    ...aiConfig,
    ...config,
  };
  return aiConfig;
});

ipcMain.handle('ai:list-models', async () => {
  return await listOllamaModels();
});

ipcMain.handle('ai:parse-schedule', async (_event, payload: { text: string; baseDate?: string }) => {
  const text = payload?.text?.trim();
  if (!text) {
    return null;
  }
  const prompt = buildSchedulePrompt(text, payload?.baseDate);
  try {
    const result = await callOllamaGenerate(prompt, 'json');
    let parsed: any = null;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      location: typeof parsed.location === 'string' ? parsed.location : '',
      startLocal: typeof parsed.startLocal === 'string' ? parsed.startLocal : '',
      endLocal: typeof parsed.endLocal === 'string' ? parsed.endLocal : '',
      allDay: typeof parsed.allDay === 'boolean' ? parsed.allDay : false,
      promptTokens: result.promptTokens,
      evalTokens: result.evalTokens,
    };
  } catch (error) {
    console.error('Ollama schedule parse failed:', error);
    return null;
  }
});

ipcMain.handle(
  'ai:search-weather-locations',
  async (_event, payload: { query: string; language: 'ko' | 'en' }) => {
    const query = payload?.query?.trim() || '';
    if (!query) return [];
    const language = payload?.language === 'en' ? 'en' : 'ko';
    try {
      return await fetchLocationSuggestions(query, language);
    } catch (error) {
      console.error('Location search failed:', error);
      return [];
    }
  }
);

ipcMain.handle(
  'ai:get-weather',
  async (
    _event,
    payload: { location: string; language: 'ko' | 'en'; latitude?: number; longitude?: number }
  ) => {
    const location = payload?.location?.trim() || 'Seoul';
    const language = payload?.language === 'en' ? 'en' : 'ko';
    const latitude = typeof payload?.latitude === 'number' ? payload.latitude : undefined;
    const longitude = typeof payload?.longitude === 'number' ? payload.longitude : undefined;
    try {
      const text = await fetchWeatherSummary(
        location,
        language,
        latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined
      );
      return { text };
    } catch (error) {
      console.error('Weather fetch failed:', error);
      return { text: language === 'ko' ? '\uC5F0\uB3D9 \uC2E4\uD328' : 'Unavailable' };
    }
  }
);


ipcMain.handle(
  'ai:get-news',
  async (_event, payload: { keyword: string; language: 'ko' | 'en'; force?: boolean }) => {
    const keyword = payload?.keyword?.trim() || (payload?.language === 'en' ? 'world news' : '국제이슈');
    const lang = payload?.language === 'en' ? 'en' : 'ko';
    const text = await fetchNewsSummary(keyword, lang, Boolean(payload?.force));
    return { text };
  }
);

ipcMain.handle('ai:generate', async (_event, payload: { prompt: string }) => {
  const prompt = payload?.prompt?.trim();
  if (!prompt) {
    return { text: '', promptTokens: 0, evalTokens: 0 };
  }
  try {
    return await callOllamaGenerate(prompt);
  } catch (error) {
    console.error('Ollama generate failed:', error);
    return { text: '', promptTokens: 0, evalTokens: 0 };
  }
});

// Print / PDF handlers
ipcMain.handle('app:print-html', async (_, html: string) => {
  const printWindow = new BrowserWindow({
    show: true,
    parent: mainWindow ?? undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  printWindow.setMenuBarVisibility(false);

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      printWindow.webContents.print({ printBackground: true }, (success, errorType) => {
        if (!success && errorType && errorType !== 'cancelled') {
          reject(new Error(errorType));
          return;
        }
        resolve();
      });
    });
  } finally {
    printWindow.close();
  }
});

ipcMain.handle('app:print-to-pdf', async (_, html: string, filenameBase?: string) => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save as PDF',
      defaultPath: `${filenameBase || 'email'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      return { canceled: true };
    }

    const pdfData = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
    });

    await fs.writeFile(filePath, pdfData);
    return { success: true, path: filePath };
  } finally {
    printWindow.close();
  }
});
