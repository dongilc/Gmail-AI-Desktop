import { useEffect, useState, useRef } from 'react';
import {
  Settings,
  User,
  Keyboard,
  Info,
  Palette,
  Sun,
  Moon,
  Monitor,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useAccountsStore } from '@/stores/accounts';
import { useThemeStore } from '@/stores/theme';
import { usePreferencesStore } from '@/stores/preferences';
import { useAiStore } from '@/stores/ai';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { playTodoCompleteSound } from '@/lib/sounds';

type TabType = 'accounts' | 'general' | 'aiServer' | 'theme' | 'shortcuts' | 'about';

type LocationSuggestion = {
  name: string;
  admin1?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  label: string;
  coords?: { lat: number; lon: number };
};

type PerfHistoryEntry = {
  at: string;
  mode: 'standard' | 'long';
  model: string;
  latencyMs: number;
  promptTokens: number;
  evalTokens: number;
  tokensPerSec: number;
};

export function SettingsDialog() {
  const [activeTab, setActiveTab] = useState<TabType>('accounts');

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[55rem]">
        <DialogHeader>
          <DialogTitle>{'\uC124\uC815'}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 min-h-[400px]">
                    {/* Tabs */}
          <div className="w-40 space-y-1">
            <TabButton
              icon={User}
              label={'\uACC4\uC815'}
              active={activeTab === 'accounts'}
              onClick={() => setActiveTab('accounts')}
            />
            <TabButton
              icon={SlidersHorizontal}
              label={'\uC77C\uBC18'}
              active={activeTab === 'general'}
              onClick={() => setActiveTab('general')}
            />
            <TabButton
              icon={Sparkles}
              label={'AI \uC11C\uBC84'}
              active={activeTab === 'aiServer'}
              onClick={() => setActiveTab('aiServer')}
            />
            <TabButton
              icon={Palette}
              label={'\uD14C\uB9C8'}
              active={activeTab === 'theme'}
              onClick={() => setActiveTab('theme')}
            />
            <TabButton
              icon={Keyboard}
              label={'\uB2E8\uCD95\uD0A4'}
              active={activeTab === 'shortcuts'}
              onClick={() => setActiveTab('shortcuts')}
            />
            <TabButton
              icon={Info}
              label={'\uC815\uBCF4'}
              active={activeTab === 'about'}
              onClick={() => setActiveTab('about')}
            />
          </div>

          {/* Content */}
          <div className="flex-1 border-l pl-4">
            {activeTab === 'accounts' && <AccountsTab />}
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'aiServer' && <AiServerTab />}
            {activeTab === 'theme' && <ThemeTab />}
            {activeTab === 'shortcuts' && <ShortcutsTab />}
            {activeTab === 'about' && <AboutTab />}
          </div>
</div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof User;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function AccountsTab() {
  const { accounts, login, logout, isLoading } = useAccountsStore();
  const {
    primaryAccountId,
    setPrimaryAccountId,
    accountOrder,
    setAccountOrder,
  } = usePreferencesStore();

  // 주계정 먼저, 그 다음 순서대로 정렬
  const sortedAccounts = [...accounts].sort((a, b) => {
    // 주계정이 항상 맨 앞
    if (a.id === primaryAccountId) return -1;
    if (b.id === primaryAccountId) return 1;

    // 그 다음 설정된 순서대로
    if (accountOrder.length > 0) {
      const aIndex = accountOrder.indexOf(a.id);
      const bIndex = accountOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    }
    return 0;
  });

  const moveAccount = (accountId: string, direction: 'up' | 'down') => {
    const currentOrder = accountOrder.length > 0 ? [...accountOrder] : accounts.map((a) => a.id);
    const index = currentOrder.indexOf(accountId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;

    [currentOrder[index], currentOrder[newIndex]] = [currentOrder[newIndex], currentOrder[index]];
    setAccountOrder(currentOrder);
  };

  const handleSetPrimary = (accountId: string) => {
    setPrimaryAccountId(accountId === primaryAccountId ? null : accountId);
  };

  // 계정이 추가/삭제되면 accountOrder 업데이트
  const accountIds = accounts.map((a) => a.id);
  const needsOrderUpdate =
    accountOrder.length !== accounts.length ||
    !accountOrder.every((id) => accountIds.includes(id));

  if (needsOrderUpdate && accounts.length > 0) {
    const newOrder = accountOrder.filter((id) => accountIds.includes(id));
    accountIds.forEach((id) => {
      if (!newOrder.includes(id)) newOrder.push(id);
    });
    if (newOrder.join(',') !== accountOrder.join(',')) {
      setAccountOrder(newOrder);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {sortedAccounts.map((account, index) => (
          <div
            key={account.id}
            className={cn(
              'p-3 border rounded-md',
              primaryAccountId === account.id && 'border-primary bg-primary/5'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => moveAccount(account.id, 'up')}
                  disabled={index === 0}
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                  title="위로"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 15l-6-6-6 6" />
                  </svg>
                </button>
                <button
                  onClick={() => moveAccount(account.id, 'down')}
                  disabled={index === sortedAccounts.length - 1}
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                  title="아래로"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
              <Avatar src={account.picture} alt={account.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{account.name}</p>
                  {primaryAccountId === account.id && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary text-primary-foreground rounded whitespace-nowrap shrink-0">
                      주계정
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{account.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant={primaryAccountId === account.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSetPrimary(account.id)}
                  className="text-xs h-7 whitespace-nowrap"
                >
                  {primaryAccountId === account.id ? '해제' : '주계정'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logout(account.id)}
                  className="text-destructive hover:text-destructive h-7 whitespace-nowrap"
                >
                  로그아웃
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {accounts.length < 4 && (
        <Button onClick={login} disabled={isLoading} className="w-full">
          계정 추가
        </Button>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p className="text-center">최대 4개의 계정을 추가할 수 있습니다</p>
        <p>• <strong>주계정</strong>: 앱 시작 시 자동으로 선택됩니다</p>
        <p>• <strong>순서</strong>: 화살표로 계정 표시 순서를 변경합니다</p>
      </div>
    </div>
  );
}


function GeneralTab() {
  const {
    showEmailSummary,
    setShowEmailSummary,
    emailBodyAdjustLevel,
    setEmailBodyAdjustLevel,
    todoCompleteSound,
    setTodoCompleteSound,
    briefingLocation,
    setBriefingLocation,
    briefingLocationCoords,
    setBriefingLocationCoords,
    briefingLanguage,
    setBriefingLanguage,
    briefingNewsKeyword,
    setBriefingNewsKeyword,
    aiMailRecommendEnabled,
    setAiMailRecommendEnabled,
    aiMailRecommendDays,
    setAiMailRecommendDays,
  } = usePreferencesStore();
  const [locationInput, setLocationInput] = useState(briefingLocation);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationHighlight, setLocationHighlight] = useState(0);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationRequestRef = useRef(0);
  const lastCommittedLocationRef = useRef<{
    label: string;
    coords: { lat: number; lon: number } | null;
  } | null>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    setLocationInput(briefingLocation);
  }, [briefingLocation]);

  const locationVerified =
    Boolean(briefingLocationCoords) &&
    briefingLocation.trim().length > 0 &&
    briefingLocation.trim().toLowerCase() === locationInput.trim().toLowerCase();

  const buildLocationLabel = (item: { name: string; admin1?: string; country?: string }) =>
    [item.name, item.admin1, item.country].filter(Boolean).join(' ');

  const commitLocation = (label: string, suggestion?: LocationSuggestion | null) => {
    const trimmed = label.trim();
    if (!trimmed) {
      setLocationInput('');
      setBriefingLocation('');
      setBriefingLocationCoords(null);
      setLocationSuggestions([]);
      setLocationHighlight(0);
      setLocationError(null);
      return;
    }

    setLocationInput(trimmed);
    setBriefingLocation(trimmed);

    let nextCoords: { lat: number; lon: number } | null = null;
    if (suggestion?.coords) {
      nextCoords = suggestion.coords;
    } else if (suggestion?.latitude != null && suggestion?.longitude != null) {
      nextCoords = { lat: suggestion.latitude, lon: suggestion.longitude };
    } else if (
      lastCommittedLocationRef.current &&
      lastCommittedLocationRef.current.label.toLowerCase() === trimmed.toLowerCase() &&
      lastCommittedLocationRef.current.coords
    ) {
      nextCoords = lastCommittedLocationRef.current.coords;
    } else if (
      briefingLocationCoords &&
      briefingLocation.trim().toLowerCase() === trimmed.toLowerCase()
    ) {
      nextCoords = briefingLocationCoords;
    }

    setBriefingLocationCoords(nextCoords);
    lastCommittedLocationRef.current = { label: trimmed, coords: nextCoords };
    setLocationSuggestions([]);
    setLocationHighlight(0);
    setLocationError(null);
  };

  useEffect(() => {
    const query = locationInput.trim();
    if (query.length < 2) {
      setLocationSuggestions([]);
      setLocationHighlight(0);
      setLocationLoading(false);
      setLocationError(null);
      return;
    }
    if (!window.electronAPI?.aiSearchWeatherLocations) {
      return;
    }
    const requestId = ++locationRequestRef.current;
    setLocationLoading(true);
    setLocationError(null);

    window.electronAPI
      .aiSearchWeatherLocations({ query, language: briefingLanguage })
      .then((list: any[]) => {
        if (requestId !== locationRequestRef.current) return;
        const items = Array.isArray(list) ? list : [];
        const next = items.map((item) => ({
          ...item,
          label: buildLocationLabel(item),
          coords:
            item.latitude != null && item.longitude != null
              ? { lat: item.latitude, lon: item.longitude }
              : undefined,
        }));
        setLocationSuggestions(next);
        setLocationHighlight(next.length > 0 ? 0 : -1);
      })
      .catch(() => {
        if (requestId !== locationRequestRef.current) return;
        setLocationError('\uAC80\uC0C9 \uC2E4\uD328');
        setLocationSuggestions([]);
        setLocationHighlight(0);
      })
      .finally(() => {
        if (requestId !== locationRequestRef.current) return;
        setLocationLoading(false);
      });
  }, [locationInput, briefingLanguage]);

  return (
    <ScrollArea className="h-[350px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 border rounded-md">
          <div>
            <div className="text-sm font-medium">{'\uC694\uC57D \uCE74\uB4DC \uD45C\uC2DC'}</div>
            <div className="text-xs text-muted-foreground">
              {'\uBA54\uC77C \uB9AC\uC2A4\uD2B8\uC5D0 \uC694\uC57D/\uC561\uC158\uC744 \uD45C\uC2DC\uD569\uB2C8\uB2E4.'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showEmailSummary}
            className={cn('toggle-switch', showEmailSummary && 'toggle-switch-on')}
            onClick={() => setShowEmailSummary(!showEmailSummary)}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="p-3 border rounded-md space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">AI 메일 추천</div>
              <div className="text-xs text-muted-foreground">
                읽지 않은 메일 중 확인이 필요한 메일을 AI가 추천합니다.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={aiMailRecommendEnabled}
              className={cn('toggle-switch', aiMailRecommendEnabled && 'toggle-switch-on')}
              onClick={() => setAiMailRecommendEnabled(!aiMailRecommendEnabled)}
            >
              <span className="toggle-thumb" />
            </button>
          </div>
          {aiMailRecommendEnabled && (
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">조회 범위</label>
              <select
                className="ai-select flex h-8 w-24 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm"
                value={aiMailRecommendDays}
                onChange={(e) => setAiMailRecommendDays(Number(e.target.value))}
              >
                <option value={3}>3일</option>
                <option value={7}>7일</option>
                <option value={14}>14일</option>
                <option value={30}>30일</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-3 border rounded-md">
          <div>
            <div className="text-sm font-medium">
              {'\uB2E4\uD06C \uBAA8\uB4DC \uBCF8\uBB38 \uC0C9\uC0C1 \uC870\uC815'}
            </div>
            <div className="text-xs text-muted-foreground">
              {'\uB2E4\uD06C \uBAA8\uB4DC\uC5D0\uC11C \uBA54\uC77C \uBCF8\uBB38 \uC0C9\uC0C1\uC744 \uBCF4\uC815\uD569\uB2C8\uB2E4.'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={emailBodyAdjustLevel === 'strong'}
            className={cn('toggle-switch', emailBodyAdjustLevel === 'strong' && 'toggle-switch-on')}
            onClick={() =>
              setEmailBodyAdjustLevel(emailBodyAdjustLevel === 'strong' ? 'off' : 'strong')
            }
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 border rounded-md">
          <div>
            <div className="text-sm font-medium">{'\uD560 \uC77C \uC644\uB8CC \uC0AC\uC6B4\uB4DC'}</div>
            <div className="text-xs text-muted-foreground">
              {
                '\uD560 \uC77C\uC744 \uC644\uB8CC\uD560 \uB54C \uC7AC\uC0DD\uB418\uB294 \uC18C\uB9AC\uB97C \uC120\uD0DD\uD569\uB2C8\uB2E4.'
              }
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="ai-select flex h-8 w-[7.5rem] rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={todoCompleteSound}
              onChange={(e) =>
                setTodoCompleteSound(
                  e.target.value as
                    | 'soft'
                    | 'softShort'
                    | 'chime'
                    | 'sparkle'
                    | 'ding'
                    | 'pop'
                    | 'none'
                )
              }
            >
              <option value="soft">{'\uBD80\uB4DC\uB7EC\uC6B4'}</option>
              <option value="softShort">{'\uC9E7\uAC8C'}</option>
              <option value="chime">{'\uCC28\uC784'}</option>
              <option value="sparkle">{'\uBC18\uC9DD'}</option>
              <option value="ding">{'\uB9C1'}</option>
              <option value="pop">{'\uD1A1'}</option>
              <option value="none">{'\uC5C6\uC74C'}</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => playTodoCompleteSound(todoCompleteSound)}
            >
              {'\uBBF8\uB9AC\uB4E3\uAE30'}
            </Button>
          </div>
        </div>

        <div className="p-3 border rounded-md space-y-3">
          <div>
            <div className="text-sm font-medium">{'\uBE0C\uB9AC\uD551 \uB370\uC774\uD130 \uC124\uC815'}</div>
            <div className="text-xs text-muted-foreground">
              {'\uB0A0\uC528/\uAD6D\uC81C \uC774\uC288 \uBE0C\uB9AC\uD551\uC5D0 \uC0AC\uC6A9\uD560 \uAE30\uBCF8 \uC815\uBCF4\uB97C \uC124\uC815\uD569\uB2C8\uB2E4.'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 relative">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">{'\uB0A0\uC528 \uC704\uCE58'}</label>
                <span
                  className={cn(
                    'location-verify-badge',
                    locationVerified ? 'location-verify-on' : 'location-verify-off'
                  )}
                >
                  {locationVerified ? '\uAC80\uC99D\uB428' : '\uBBF8\uAC80\uC99D'}
                </span>
              </div>
              <Input
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onBlur={() => {
                  if (skipBlurCommitRef.current) {
                    skipBlurCommitRef.current = false;
                    return;
                  }
                  const exactMatch = locationSuggestions.find(
                    (item) => item.label.toLowerCase() === locationInput.trim().toLowerCase()
                  );
                  if (exactMatch) {
                    commitLocation(exactMatch.label, exactMatch);
                  } else {
                    commitLocation(locationInput);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (locationSuggestions.length > 0) {
                      setLocationHighlight((prev) =>
                        Math.min(Math.max(prev, 0) + 1, locationSuggestions.length - 1)
                      );
                    }
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (locationSuggestions.length > 0) {
                      setLocationHighlight((prev) => Math.max(prev - 1, 0));
                    }
                    return;
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (locationSuggestions.length > 0 && locationHighlight >= 0) {
                      const selected = locationSuggestions[locationHighlight];
                      skipBlurCommitRef.current = true;
                      commitLocation(selected.label, selected);
                      return;
                    }
                    const exactMatch = locationSuggestions.find(
                      (item) => item.label.toLowerCase() === locationInput.trim().toLowerCase()
                    );
                    if (exactMatch) {
                      commitLocation(exactMatch.label, exactMatch);
                    } else {
                      commitLocation(locationInput);
                    }
                  }
                }}
                placeholder="Seoul"
              />
              {(locationInput.trim().length > 0 &&
                (locationLoading || locationError || locationSuggestions.length > 0)) && (
                <div className="location-suggest-panel">
                  {locationLoading && (
                    <div className="location-suggest-item muted">{'\uAC80\uC0C9 \uC911...'}</div>
                  )}
                  {!locationLoading && locationError && (
                    <div className="location-suggest-item muted">{locationError}</div>
                  )}
                  {!locationLoading &&
                    locationSuggestions.map((item, index) => (
                      <button
                        key={`${item.name}-${item.admin1}-${item.country}-${item.latitude ?? ''}`}
                        type="button"
                        className={cn(
                          'location-suggest-item',
                          index === locationHighlight && 'location-suggest-active'
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          skipBlurCommitRef.current = true;
                          commitLocation(item.label, item);
                        }}
                        onMouseEnter={() => setLocationHighlight(index)}
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{'\uBE0C\uB9AC\uD551 \uC5B8\uC5B4'}</label>
              <select
                className="ai-select flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={briefingLanguage}
                onChange={(e) => setBriefingLanguage(e.target.value as 'ko' | 'en')}
              >
                <option value="ko">{'\uD55C\uAD6D\uC5B4'}</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-muted-foreground">
                {'\uAD6D\uC81C \uC774\uC288 \uD0A4\uC6CC\uB4DC'}
              </label>
              <Input
                value={briefingNewsKeyword}
                onChange={(e) => setBriefingNewsKeyword(e.target.value)}
                placeholder="\uAD6D\uC81C\uC774\uC288"
              />
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function AiServerTab() {
  const {
    aiServerUrl,
    setAiServerUrl,
    aiModel,
    setAiModel,
    aiTemperature,
    setAiTemperature,
    aiNumPredict,
    setAiNumPredict,
    aiMonthlyTokenCap,
    setAiMonthlyTokenCap,
    aiConcurrentTasks,
    setAiConcurrentTasks,
  } = usePreferencesStore();
  const { incrementPending, decrementPending, addCompleted } = useAiStore();
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'online' | 'offline'>(
    'idle'
  );
  const [connectionLatency, setConnectionLatency] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [perfStatus, setPerfStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [perfResult, setPerfResult] = useState<{
    latencyMs: number;
    promptTokens: number;
    evalTokens: number;
    tokensPerSec: number;
  } | null>(null);
  const [perfError, setPerfError] = useState<string | null>(null);
  const [perfMode, setPerfMode] = useState<'standard' | 'long'>('standard');
  const [perfHistory, setPerfHistory] = useState<PerfHistoryEntry[]>([]);
  const perfHistoryKey = 'ai-perf-history';

  const refreshModels = async () => {
    if (!window.electronAPI?.aiListModels) {
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const list = await window.electronAPI.aiListModels();
      setModels(Array.isArray(list) ? list : []);
    } catch {
      setModelsError('\uBAA8\uB378 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!window.electronAPI?.aiHealth) {
      return;
    }
    setConnectionStatus('testing');
    setConnectionError(null);
    const start = performance.now();
    incrementPending();
    try {
      const result = await window.electronAPI.aiHealth();
      const latency = Math.max(0, Math.round(performance.now() - start));
      setConnectionLatency(latency);
      if (result?.ok) {
        setConnectionStatus('online');
      } else {
        setConnectionStatus('offline');
        setConnectionError('\uC11C\uBC84 \uC751\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.');
      }
    } catch {
      setConnectionLatency(null);
      setConnectionStatus('offline');
      setConnectionError('\uC5F0\uACB0 \uC2E4\uD328');
    } finally {
      decrementPending();
      addCompleted();
    }
  };

  const clearPerfHistory = () => {
    setPerfHistory([]);
    try {
      localStorage.removeItem(perfHistoryKey);
    } catch {
      // ignore
    }
  };

  const formatPerfTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const runPerformanceTest = async () => {
    if (!window.electronAPI?.aiGenerate) {
      return;
    }
    setPerfStatus('running');
    setPerfError(null);
    setPerfResult(null);
    const prompt =
      perfMode === 'long'
        ? [
            'You are a helpful assistant.',
            'Answer the following in Korean with exactly 8 sentences.',
            'Do not use bullet points.',
            'Question: 전기차 배터리가 중요한 이유를 설명해 주세요.',
            'Context:',
            '전기차는 주행거리, 충전시간, 안전성이 구매 결정에 영향을 준다.',
            '배터리는 차량 가격의 큰 비중을 차지하며 성능과 경험을 좌우한다.',
            '온도와 충방전 패턴은 수명과 안전성에 영향을 준다.',
          ].join('\n')
        : [
            'You are a helpful assistant.',
            'Answer the following in Korean with exactly 3 sentences.',
            'Do not use bullet points.',
            'Question: 전기차 배터리가 중요한 이유를 설명해 주세요.',
          ].join('\n');
    const start = performance.now();
    incrementPending();
    try {
      const result = await window.electronAPI.aiGenerate({ prompt });
      const elapsed = Math.max(1, Math.round(performance.now() - start));
      const promptTokens = result?.promptTokens ?? 0;
      const evalTokens = result?.evalTokens ?? 0;
      const tokensPerSec =
        evalTokens > 0 ? Math.round((evalTokens / (elapsed / 1000)) * 10) / 10 : 0;
      setPerfResult({
        latencyMs: elapsed,
        promptTokens,
        evalTokens,
        tokensPerSec,
      });
      const entry: PerfHistoryEntry = {
        at: new Date().toISOString(),
        mode: perfMode,
        model: aiModel,
        latencyMs: elapsed,
        promptTokens,
        evalTokens,
        tokensPerSec,
      };
      setPerfHistory((prev) => {
        const next = [entry, ...prev].slice(0, 10);
        try {
          localStorage.setItem(perfHistoryKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setPerfStatus('done');
    } catch {
      setPerfStatus('error');
      setPerfError('처리속도 테스트 실패');
    } finally {
      decrementPending();
      addCompleted();
    }
  };

  useEffect(() => {
    void refreshModels();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(perfHistoryKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setPerfHistory(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="p-3 border rounded-md space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{'AI \uC11C\uBC84 \uC124\uC815'}</div>
            <div className="text-xs text-muted-foreground">
              {'Ollama \uC11C\uBC84 \uC8FC\uC18C\uC640 \uBAA8\uB378/\uD30C\uB77C\uBBF8\uD130\uB97C \uC124\uC815\uD569\uB2C8\uB2E4.'}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={connectionStatus === 'testing'}
                className="h-7 px-2 text-xs"
              >
                {connectionStatus === 'testing'
                  ? '\uC5F0\uACB0 \uD655\uC778 \uC911...'
                  : '\uC5F0\uACB0 \uD14C\uC2A4\uD2B8'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={runPerformanceTest}
                disabled={perfStatus === 'running'}
                className="h-7 px-2 text-xs"
              >
                {perfStatus === 'running'
                  ? '\uC18D\uB3C4 \uCE21\uC815 \uC911...'
                  : '\uCC98\uB9AC\uC18D\uB3C4 \uD14C\uC2A4\uD2B8'}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{'\uD14C\uC2A4\uD2B8 \uAE38\uC774'}</span>
              <div className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setPerfMode('standard')}
                  className={cn(
                    'px-2 py-1 text-[11px] rounded-full transition-colors',
                    perfMode === 'standard'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {'\uC9E7\uAC8C'}
                </button>
                <button
                  type="button"
                  onClick={() => setPerfMode('long')}
                  className={cn(
                    'px-2 py-1 text-[11px] rounded-full transition-colors',
                    perfMode === 'long'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {'\uAE38\uAC8C'}
                </button>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground text-right">
              {connectionStatus === 'online' &&
                `\uC5F0\uACB0\uB428${connectionLatency ? ` - ${connectionLatency}ms` : ''}`}
              {connectionStatus === 'offline' && (connectionError || '\uC624\uD504\uB77C\uC778')}
              {connectionStatus === 'testing' && '\uC5F0\uACB0 \uD655\uC778 \uC911...'}
              {connectionStatus === 'idle' && ' '}
            </div>
            <div className="text-[11px] text-muted-foreground text-right">
              {perfStatus === 'done' && perfResult
                ? `\uC751\uB2F5 ${perfResult.latencyMs}ms - \uCD9C\uB825 ${perfResult.evalTokens}tok - ${perfResult.tokensPerSec} tok/s`
                : perfStatus === 'error'
                  ? perfError || '\uD14C\uC2A4\uD2B8 \uC2E4\uD328'
                  : perfStatus === 'running'
                    ? '\uCC98\uB9AC\uC18D\uB3C4 \uCE21\uC815 \uC911...'
                    : ' '}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">{'\uBAA8\uB378 \uBAA9\uB85D'}</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshModels}
                disabled={modelsLoading}
                className="h-7 px-2 text-xs"
              >
                {modelsLoading ? '\uBD88\uB7EC\uC624\uB294 \uC911...' : '\uC0C8\uB85C\uACE0\uCE68'}
              </Button>
            </div>
            <select
              className="ai-select flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              disabled={modelsLoading || models.length === 0}
            >
              <option value="">{'\uBAA8\uB378 \uC120\uD0DD'}</option>
              {models.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {modelsError && <div className="text-[11px] text-destructive">{modelsError}</div>}
            {!modelsError && models.length === 0 && (
              <div className="text-[11px] text-muted-foreground">
                {'\uBAA8\uB378\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC11C\uBC84 \uC8FC\uC18C\uB97C \uD655\uC778\uD558\uACE0 \uC0C8\uB85C\uACE0\uCE68\uD558\uC138\uC694.'}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{'\uC11C\uBC84 \uC8FC\uC18C'}</label>
            <Input
              value={aiServerUrl}
              onChange={(e) => setAiServerUrl(e.target.value)}
              placeholder="http://192.168.50.220:11434"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{'\uBAA8\uB378'}</label>
            <Input
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="llama3.1:8b"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {'Temperature (\uCC3D\uC758\uC131)'}
            </label>
            <Input
              type="number"
              step="0.1"
              value={aiTemperature}
              onChange={(e) => setAiTemperature(Number(e.target.value))}
            />
            <div className="text-[11px] text-muted-foreground">
              {'\uB0AE\uC744\uC218\uB85D \uC77C\uAD00\uB41C \uC694\uC57D, \uB192\uC744\uC218\uB85D \uD45C\uD604\uC774 \uB2E4\uC591\uD569\uB2C8\uB2E4.'}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {'\uC694\uC57D 1\uD68C \uCD9C\uB825 \uC0C1\uD55C (max output)'}
            </label>
            <Input
              type="number"
              value={aiNumPredict}
              onChange={(e) => setAiNumPredict(Number(e.target.value))}
            />
            <div className="text-[11px] text-muted-foreground">
              {'\uC694\uC57D 1\uD68C \uCD9C\uB825 \uD1A0\uD070 \uC0C1\uD55C\uC785\uB2C8\uB2E4.'}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{'\uC6D4\uAC04 \uC0C1\uD55C (usage cap)'}</label>
            <Input
              type="number"
              value={aiMonthlyTokenCap}
              onChange={(e) => setAiMonthlyTokenCap(Number(e.target.value))}
            />
            <div className="text-[11px] text-muted-foreground">
              {'\uC6D4\uAC04 \uB204\uC801 \uD1A0\uD070 \uAE30\uC900 \uC0C1\uD55C\uC785\uB2C8\uB2E4.'}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{'동시 작업 개수'}</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={aiConcurrentTasks}
              onChange={(e) => setAiConcurrentTasks(Math.max(1, Math.min(10, Number(e.target.value))))}
            />
            <div className="text-[11px] text-muted-foreground">
              {'동시에 처리할 AI 작업 수입니다. (1~10)'}
            </div>
          </div>
        </div>
        {perfHistory.length > 0 && (
          <div className="pt-3 border-t space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{'\uCC98\uB9AC\uC18D\uB3C4 \uAE30\uB85D'}</div>
              <button
                type="button"
                onClick={clearPerfHistory}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                {'\uAE30\uB85D \uC0AD\uC81C'}
              </button>
            </div>
            <div className="space-y-1 max-h-28 overflow-auto pr-1">
              {perfHistory.map((item, index) => (
                <div
                  key={`${item.at}-${index}`}
                  className="flex items-center justify-between text-[11px] text-muted-foreground"
                >
                  <span className="truncate max-w-[55%]">
                    {formatPerfTime(item.at)} - {item.model} -{' '}
                    {item.mode === 'long' ? '\uAE38\uAC8C' : '\uC9E7\uAC8C'}
                  </span>
                  <span>
                    {item.latencyMs}ms - {item.evalTokens}tok - {item.tokensPerSec} tok/s
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeTab() {
  const { theme, setTheme } = useThemeStore();

  const themes = [
    { value: 'light' as const, label: '\uB77C\uC774\uD2B8', icon: Sun, description: '\uBC1D\uC740 \uD14C\uB9C8' },
    { value: 'dark' as const, label: '\uB2E4\uD06C', icon: Moon, description: '\uC5B4\uB450\uC6B4 \uD14C\uB9C8' },
    { value: 'system' as const, label: '\uC2DC\uC2A4\uD15C', icon: Monitor, description: '\uC2DC\uC2A4\uD15C \uC124\uC815\uC5D0 \uB530\uB984' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-3">{'\uD14C\uB9C8 \uC120\uD0DD'}</h3>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(({ value, label, icon: Icon, description }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 border rounded-lg transition-all',
                theme === value
                  ? 'border-primary bg-primary/5 ring-2 ring-primary'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <Icon
                className={cn(
                  'h-8 w-8',
                  theme === value ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t">
        <p className="text-xs text-muted-foreground">
          {'\uD14C\uB9C8 \uBCC0\uACBD\uC740 \uC989\uC2DC \uC801\uC6A9\uB429\uB2C8\uB2E4. \uC2DC\uC2A4\uD15C \uD14C\uB9C8\uB97C \uC120\uD0DD\uD558\uBA74 \uC6B4\uC601\uCCB4\uC81C\uC758 \uB2E4\uD06C \uBAA8\uB4DC \uC124\uC815\uC744 \uB530\uB985\uB2C8\uB2E4.'}
        </p>
      </div>
    </div>
  );
}


function ShortcutsTab() {
  const shortcuts = [
    { key: 'Ctrl + N', description: '\uC0C8 \uBA54\uC77C \uC791\uC131' },
    { key: 'Ctrl + R', description: '\uB2F5\uC7A5' },
    { key: 'Ctrl + T', description: '\uD560 \uC77C\uB85C \uCD94\uAC00' },
    { key: 'Ctrl + F', description: '\uAC80\uC0C9' },
    { key: 'Ctrl + Enter', description: '\uBA54\uC77C \uBCF4\uB0B4\uAE30' },
  ];

  return (
    <ScrollArea className="h-[350px]">
      <div className="space-y-2">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.key}
            className="flex items-center justify-between p-3 border rounded-md"
          >
            <span className="text-sm">{shortcut.description}</span>
            <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{shortcut.key}</kbd>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}


function AboutTab() {
  return (
    <div className="space-y-4">
      <div className="text-center py-8">
        <h3 className="text-2xl font-bold">Gmail Desktop</h3>
        <p className="text-muted-foreground mt-1">{'\uBC84\uC804 1.0.0'}</p>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          {
            'Gmail Desktop\uB294 \uC5EC\uB7EC Gmail \uACC4\uC815\uC744 \uD558\uB098\uC758 \uD654\uBA74\uC5D0\uC11C \uAD00\uB9AC\uD560 \uC218 \uC788\uB294 \uB370\uC2A4\uD06C\uD1B1 \uC774\uBA54\uC77C \uD074\uB77C\uC774\uC5B8\uD2B8\uC785\uB2C8\uB2E4.'
          }
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>{'\uCD5C\uB300 4\uAC1C\uC758 Gmail \uACC4\uC815 \uB3D9\uC2DC \uAD00\uB9AC'}</li>
          <li>{'Google Calendar \uC5F0\uB3D9'}</li>
          <li>{'Google Tasks \uC5F0\uB3D9'}</li>
          <li>{'\uC774\uBA54\uC77C \uBE60\uB978 \uAC80\uC0C9'}</li>
        </ul>
      </div>

      <div className="pt-4 text-xs text-muted-foreground">
        <p>Electron + React + TypeScript</p>
        <p>{'Gmail API, Calendar API, Tasks API \uC0AC\uC6A9'}</p>
      </div>
    </div>
  );
}

