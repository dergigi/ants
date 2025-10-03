# Refactoring Plan for Ants

## Overview

This document outlines a comprehensive refactoring strategy for the ants codebase. The primary goals are:

1. **Keep files under 210 lines** - Easier to read, navigate, and maintain
2. **Apply DRY principles** - Eliminate code duplication
3. **Single Responsibility** - Each file should have one clear purpose
4. **Better modularity** - Easier to test and modify individual components

### Current State

- **Total lines of code:** ~15,000
- **Largest files:**
  - `SearchView.tsx`: 1,786 lines
  - `search.ts`: 1,334 lines
  - `relays.ts`: 584 lines
  - `ndk.ts`: 541 lines
  - `ProfileCard.tsx`: 436 lines
  - `EventCard.tsx`: 407 lines
  - `ClientFilters.tsx`: 333 lines

---

## Priority 1: Break Down SearchView (1,786 lines → multiple files)

### Current Issues
- Massive single file with 1,786 lines
- Mixes UI, state management, event handling, rendering logic
- Multiple responsibilities: search, filters, relay management, content rendering
- Hard to test individual pieces
- Git diffs are painful

### Refactoring Strategy

#### 1.1 Extract State Management
**New file:** `src/components/SearchView/useSearchState.ts` (~150 lines)

```typescript
// Consolidate all useState, useRef, and state update helpers
export function useSearchState(initialQuery: string) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingAuthor, setResolvingAuthor] = useState(false);
  // ... all other state
  
  return {
    query, setQuery,
    results, setResults,
    loading, setLoading,
    // ... all state and setters
  };
}
```

**Benefits:**
- Single source of truth for state
- Easy to add new state without cluttering main component
- Testable state logic

#### 1.2 Extract Search Logic Hook
**New file:** `src/components/SearchView/useSearchLogic.ts` (~200 lines)

```typescript
export function useSearchLogic(state, options) {
  const handleSearch = useCallback(async (searchQuery: string) => {
    // All search orchestration logic
  }, [dependencies]);
  
  const handleSubmit = useCallback((e: React.FormEvent) => {
    // Form submission logic
  }, [dependencies]);
  
  const updateUrlForSearch = useCallback((query: string) => {
    // URL update logic
  }, [dependencies]);
  
  return { handleSearch, handleSubmit, updateUrlForSearch };
}
```

**Benefits:**
- Isolates complex search logic
- Easier to debug search issues
- Can be tested independently

#### 1.3 Extract Content Rendering
**New file:** `src/components/SearchView/ContentRenderer.tsx` (~150 lines)

```typescript
// Pure rendering logic for hashtags, emojis, URLs, nostr tokens
export function useContentRenderer(options: {
  successfulPreviews: Set<string>;
  handleContentSearch: (query: string) => void;
  goToProfile: (npub: string) => void;
}) {
  const renderContentWithClickableHashtags = useCallback(...);
  return { renderContentWithClickableHashtags };
}
```

**New file:** `src/components/SearchView/EventRenderers.tsx` (~200 lines)

```typescript
// Kind-specific event rendering
export function KindOneRenderer({ event, ...props }) { }
export function KindTwentyRenderer({ event, ...props }) { }
export function KindCodeRenderer({ event, ...props }) { }
export function KindVideoRenderer({ event, ...props }) { }
export function KindHighlightRenderer({ event, ...props }) { }
export function DefaultKindRenderer({ event, ...props }) { }
```

**New file:** `src/components/SearchView/ParentChainRenderer.tsx` (~100 lines)

```typescript
export function useParentChain(expandedParents, getReplyToEventId) {
  const renderNoteHeader = useCallback(...);
  const renderParentChain = useCallback(...);
  return { renderNoteHeader, renderParentChain };
}
```

**Benefits:**
- Rendering logic separated from business logic
- Each renderer can be developed/tested independently
- Easier to add new event kinds

#### 1.4 Extract Slash Commands
**New file:** `src/components/SearchView/useSlashCommands.ts` (~150 lines)

```typescript
export function useSlashCommands(options: {
  setTopCommandText: (text: string | null) => void;
  setTopExamples: (examples: string[] | null) => void;
  setLoginState: (state: LoginState) => void;
  setCurrentUser: (user: NDKUser | null) => void;
  setPlaceholder: (text: string) => void;
}) {
  const buildCli = useCallback(...);
  const runSlashCommand = useMemo(...);
  const isSlashCommand = useCallback(...);
  
  return { buildCli, runSlashCommand, isSlashCommand };
}
```

**Benefits:**
- Command logic isolated
- Easy to add new commands
- Clear command interface

#### 1.5 Extract Filter Logic
**New file:** `src/components/SearchView/useFilters.ts` (~100 lines)

```typescript
export function useFilters(
  results: NDKEvent[],
  filterSettings: FilterSettings,
  toggledRelays: Set<string>
) {
  const shouldEnableFilters = useMemo(...);
  const filteredResults = useMemo(...);
  const fuseFilteredResults = useMemo(...);
  
  return {
    shouldEnableFilters,
    filteredResults,
    fuseFilteredResults
  };
}
```

**Benefits:**
- Filter logic centralized
- Performance optimizations isolated
- Easy to modify filter behavior

#### 1.6 Main SearchView Component
**Resulting file:** `src/components/SearchView/index.tsx` (~200 lines)

```typescript
export default function SearchView(props) {
  // Compose all hooks
  const state = useSearchState(props.initialQuery);
  const searchLogic = useSearchLogic(state, props);
  const commands = useSlashCommands({ ... });
  const filters = useFilters(state.results, state.filterSettings, state.toggledRelays);
  const contentRenderer = useContentRenderer({ ... });
  const parentChain = useParentChain({ ... });
  
  // Pure rendering - no business logic
  return (
    <div className="w-full pt-4">
      <SearchInput {...inputProps} />
      <QueryTranslation {...queryProps} />
      <ResultsList {...resultsProps} />
    </div>
  );
}
```

**Benefits:**
- Clear component structure
- Easy to understand data flow
- Simple to maintain

---

## Priority 2: Modularize search.ts (1,334 lines → multiple files)

### Current Issues
- One massive file handling all search variants
- Mixes query parsing, relay selection, subscription logic
- Hard to test individual search strategies
- Complex conditional branching
- Difficult to add new search types

### Refactoring Strategy

#### 2.1 Extract Query Processing
**New file:** `src/lib/search/queryProcessing.ts` (~150 lines)

```typescript
export function extractNip50Extensions(rawQuery: string): {
  cleaned: string;
  extensions: Nip50Extensions;
} { }

export function stripRelayFilters(rawQuery: string): string { }

export function extractKindFilter(rawQuery: string): {
  cleaned: string;
  kinds?: number[];
} { }

export function parseOrQuery(query: string): string[] { }

export function expandParenthesizedOr(query: string): string[] { }
```

**Benefits:**
- Query parsing isolated and testable
- Easy to add new query modifiers
- Clear parsing pipeline

#### 2.2 Extract Subscription Logic
**New file:** `src/lib/search/subscriptions.ts` (~200 lines)

```typescript
export async function subscribeAndStream(
  filter: NDKFilter,
  options: StreamingOptions
): Promise<NDKEvent[]> { }

export async function subscribeAndCollect(
  filter: NDKFilter,
  timeoutMs: number,
  relaySet?: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> { }
```

**Benefits:**
- Subscription logic reusable
- Easier to debug connection issues
- Consistent error handling

#### 2.3 Extract Search Strategies
**New file:** `src/lib/search/authorSearch.ts` (~200 lines)

```typescript
// Handle by:<author> searches
export async function searchByAuthor(
  author: string,
  terms: string,
  options: SearchOptions
): Promise<NDKEvent[]> {
  // Resolve author to npub
  // Search with author filter
  // Handle fallbacks
}
```

**New file:** `src/lib/search/hashtagSearch.ts` (~150 lines)

```typescript
// Handle pure hashtag searches
export async function searchByHashtags(
  hashtags: string[],
  options: SearchOptions
): Promise<NDKEvent[]> {
  // Use tag-based filters
  // Broad relay set (no NIP-50 needed)
}
```

**New file:** `src/lib/search/identifierSearch.ts` (~150 lines)

```typescript
// Handle nevent, note, naddr, npub lookups
export async function fetchByIdentifier(
  identifier: string,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  // Decode NIP-19 identifier
  // Fetch with relay hints
  // Fallback to default relays
}
```

**New file:** `src/lib/search/profileSearch.ts` (~100 lines)

```typescript
// Handle p:<term> profile searches
export async function searchProfiles(
  term: string,
  options: SearchOptions
): Promise<NDKEvent[]> {
  // Full-text profile search
  // Handle npub/hex directly
}
```

**New file:** `src/lib/search/urlSearch.ts` (~100 lines)

```typescript
// Handle URL searches (already exists, but document here)
export async function searchUrlEvents(...) { }
```

**Benefits:**
- Each search type is self-contained
- Easy to add new search strategies
- Clear separation of concerns
- Better error messages (know which strategy failed)

#### 2.4 Main Search Orchestrator
**New file:** `src/lib/search/index.ts` (~150 lines)

```typescript
export async function searchEvents(
  query: string,
  limit: number = 200,
  options?: SearchOptions,
  relaySetOverride?: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  // Extract extensions
  const { cleaned, extensions } = extractNip50Extensions(query);
  
  // Detect search type
  if (isIdentifier(cleaned)) return fetchByIdentifier(cleaned, abortSignal);
  if (isProfileSearch(cleaned)) return searchProfiles(cleaned, options);
  if (isHashtagOnly(cleaned)) return searchByHashtags(cleaned, options);
  if (hasAuthor(cleaned)) return searchByAuthor(cleaned, options);
  if (isUrl(cleaned)) return searchUrlEvents(cleaned, options);
  
  // Default: full-text search
  return fullTextSearch(cleaned, extensions, options);
}
```

**Benefits:**
- Clear routing logic
- Easy to understand search flow
- Simple to add new search types
- Minimal branching

---

## Priority 3: Simplify Relay Management

### Current Issues
- `relays.ts` (584 lines) and `ndk.ts` (541 lines) have overlapping concerns
- Relay info caching mixed with connection logic
- User relay discovery spread across multiple functions
- Hard to understand relay selection logic

### Refactoring Strategy

#### 3.1 Split relays.ts into Module

**Directory structure:**
```
src/lib/relays/
  ├── index.ts          (~100 lines - public API)
  ├── config.ts         (~50 lines - relay URLs)
  ├── discovery.ts      (~150 lines - user relay discovery)
  ├── info.ts           (~150 lines - NIP-11 detection)
  └── sets.ts           (~100 lines - relay set creation)
```

**New file:** `src/lib/relays/config.ts`

```typescript
export const RELAYS = {
  DEFAULT: [...],
  SEARCH: [...],
  PROFILE_SEARCH: [...],
  PREMIUM: [...],
  VERTEX_DVM: [...]
} as const;
```

**New file:** `src/lib/relays/discovery.ts`

```typescript
export async function discoverUserRelays(pubkey: string): Promise<{
  userRelays: string[];
  blockedRelays: string[];
  searchRelays: string[];
}> { }

export async function getUserRelayUrlsFromWellKnown(
  pubkey: string,
  nip05?: string
): Promise<string[]> { }
```

**New file:** `src/lib/relays/info.ts`

```typescript
export async function getRelayInfo(relayUrl: string): Promise<RelayInfo> { }

async function checkRelayInfoViaHttp(relayUrl: string): Promise<RelayInfo> { }

export function clearRelayInfoCache(): void { }
```

**New file:** `src/lib/relays/sets.ts`

```typescript
export async function extendWithUserAndPremium(
  relayUrls: readonly string[],
  options?: ExtendOptions
): Promise<string[]> { }

export const relaySets = {
  default: async () => { },
  search: async () => { },
  profileSearch: async () => { },
  premium: async () => { },
  vertexDvm: async () => { }
} as const;

export async function getNip50SearchRelaySet(): Promise<NDKRelaySet> { }
```

**New file:** `src/lib/relays/index.ts`

```typescript
// Re-export everything
export * from './config';
export * from './discovery';
export * from './info';
export * from './sets';
```

**Benefits:**
- Clear separation of concerns
- Easy to find relay-related code
- Better caching strategy isolation
- Simpler testing

#### 3.2 Split ndk.ts into Module

**Directory structure:**
```
src/lib/ndk/
  ├── index.ts          (~100 lines - NDK instance + public API)
  ├── connection.ts     (~200 lines - connection management)
  ├── cache.ts          (~150 lines - cache initialization)
  └── subscribe.ts      (~100 lines - safe wrappers)
```

**New file:** `src/lib/ndk/cache.ts`

```typescript
export async function ensureCacheInitialized(): Promise<void> { }

export async function safeExecuteWithCacheFallback<T>(
  operation: () => T | Promise<T>,
  fallbackValue: T
): Promise<T> { }

function disableCacheAdapter(reason?: unknown): void { }
```

**New file:** `src/lib/ndk/connection.ts`

```typescript
export interface ConnectionStatus { }

export async function connect(timeoutMs?: number): Promise<ConnectionStatus> { }

export async function connectWithTimeout(timeoutMs?: number): Promise<void> { }

export function startRelayMonitoring(): void { }
export function stopRelayMonitoring(): void { }

export function addConnectionStatusListener(
  listener: (status: ConnectionStatus) => void
): void { }

export function markRelayActivity(relayUrl: string): void { }
```

**New file:** `src/lib/ndk/subscribe.ts`

```typescript
export function isValidFilter(filter: NDKFilter): boolean { }

export function safeSubscribe(
  filters: NDKFilter[],
  options?: Record<string, unknown>
): NDKSubscription | null { }

export async function safePublish(
  event: NDKEvent,
  relaySet?: NDKRelaySet
): Promise<boolean> { }
```

**New file:** `src/lib/ndk/index.ts`

```typescript
import NDK from '@nostr-dev-kit/ndk';
import NDKCacheAdapterSqliteWasm from '@nostr-dev-kit/ndk-cache-sqlite-wasm';

const cacheAdapter = new NDKCacheAdapterSqliteWasm({
  dbName: 'ants-ndk-cache',
  wasmUrl: '/ndk/sql-wasm.wasm'
});

export const ndk = new NDK({
  explicitRelayUrls: [...RELAYS.DEFAULT],
  cacheAdapter,
  clientName: 'Ants'
});

// Re-export utilities
export * from './connection';
export * from './cache';
export * from './subscribe';
```

**Benefits:**
- Clear NDK initialization
- Connection logic isolated
- Cache errors handled separately
- Easy to mock for testing

---

## Priority 4: DRY Up Component Rendering

### Current Issues
- Duplicate rendering logic in ProfileCard and EventCard
- Similar patterns for lightning addresses, websites, NIP-05
- Repeated portal menu logic
- Copy-paste UI patterns

### Refactoring Strategy

#### 4.1 Extract Shared UI Components

**New file:** `src/components/shared/LinkButton.tsx` (~50 lines)

```typescript
export function LinkButton({
  href,
  onClick,
  icon,
  children,
  variant = 'default'
}: LinkButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={getLinkButtonClasses(variant)}
    >
      {icon && <FontAwesomeIcon icon={icon} />}
      {children}
    </button>
  );
}

export function ExternalLinkButton({ href, children }: ExternalLinkProps) { }
export function SearchLinkButton({ query, children }: SearchLinkProps) { }
export function CopyLinkButton({ text, children }: CopyLinkProps) { }
```

**New file:** `src/components/shared/PortalMenu.tsx` (~100 lines)

```typescript
export function PortalMenu({
  items,
  trigger,
  position = 'bottom-right'
}: PortalMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Portal menu logic
  return (
    <>
      <button ref={buttonRef} onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </button>
      {isOpen && createPortal(
        <div style={menuPosition}>
          {items.map(item => <MenuItem key={item.name} {...item} />)}
        </div>,
        document.body
      )}
    </>
  );
}
```

**New file:** `src/components/shared/MetadataRow.tsx` (~80 lines)

```typescript
export function MetadataRow({
  lightning,
  website,
  nip05,
  user,
  onProfileClick,
  onLightningSearch,
  onWebsiteSearch
}: MetadataRowProps) {
  return (
    <div className="text-xs text-gray-300 flex items-center gap-3">
      {nip05 && <Nip05Display user={user} onProfileClick={onProfileClick} />}
      {lightning && <LightningDisplay {...lightningProps} />}
      {website && <WebsiteDisplay {...websiteProps} />}
    </div>
  );
}
```

**New file:** `src/components/shared/CardFooter.tsx` (~80 lines)

```typescript
export function CardFooter({
  actions,
  rightContent,
  timestamp,
  variant = 'default'
}: CardFooterProps) {
  return (
    <div className={getFooterClasses(variant)}>
      <div className="flex items-center gap-2">
        {actions}
      </div>
      <div className="flex items-center gap-2">
        {rightContent}
        {timestamp && <span className="text-xs">{timestamp}</span>}
      </div>
    </div>
  );
}
```

**Benefits:**
- Reusable UI components
- Consistent styling
- Easier to update designs
- Less code duplication

#### 4.2 Simplify ProfileCard
**Target:** `src/components/ProfileCard.tsx` (~250 lines, down from 436)

```typescript
export default function ProfileCard({ event, onAuthorClick, showBanner }: Props) {
  // Use shared components
  return (
    <div>
      <ProfileHeader {...headerProps} />
      <ProfileBanner {...bannerProps} />
      <ProfileContent {...contentProps} />
      <MetadataRow {...metadataProps} />
      <CardFooter {...footerProps}>
        <PortalMenu items={explorerItems} />
        <CardActions {...actionsProps} />
      </CardFooter>
    </div>
  );
}
```

**Extract:**
- `ProfileHeader.tsx` (~60 lines)
- `ProfileBanner.tsx` (~50 lines)
- `ProfileContent.tsx` (~80 lines)

#### 4.3 Simplify EventCard
**Target:** `src/components/EventCard.tsx` (~200 lines, down from 407)

```typescript
export default function EventCard({
  event,
  onAuthorClick,
  renderContent,
  variant = 'card',
  mediaRenderer,
  footerRight,
  className,
  showFooter = true
}: Props) {
  // Use shared components
  return (
    <div className={containerClasses}>
      <AuthorBadge author={event.author} onClick={onAuthorClick} />
      <div className={contentClasses}>
        {isHighlight ? (
          <HighlightContent highlight={highlight} />
        ) : (
          renderContent(event.content || '')
        )}
        {mediaRenderer?.(event.content || '')}
      </div>
      {showFooter && (
        <CardFooter
          actions={
            <>
              <PortalMenu items={explorerItems} />
              <CardActions event={event} onToggleRaw={onToggleRaw} />
            </>
          }
          rightContent={footerRight}
        />
      )}
      {showRaw && <RawEventJson event={event} />}
    </div>
  );
}
```

**Benefits:**
- Smaller, focused components
- Shared UI patterns
- Easier to maintain
- Consistent user experience

---

## Priority 5: Consolidate Utilities

### Current Issues
- Multiple utility files with overlapping concerns
- Some utilities too small (could be consolidated)
- Some too large (should be split)
- Inconsistent organization

### Refactoring Strategy

#### 5.1 Consolidate URL Utilities

**Problem:** Two files with URL utilities
- `src/lib/urlUtils.ts`
- `src/lib/utils/urlUtils.ts`

**Solution:** Merge into `src/lib/utils/urls.ts`

```typescript
// URL validation
export function isAbsoluteHttpUrl(url: string): boolean { }
export function normalizeRelayUrl(url: string): string { }

// URL formatting
export function formatUrlForDisplay(url: string, maxLength: number): { } { }
export function cleanWebsiteUrl(url: string): string { }
export function trimImageUrl(url: string): string { }

// URL extraction
export function extractVideoUrls(content: string): string[] { }
export function extractRelaySourcesFromEvent(event: NDKEvent): string[] { }

// URL utilities
export function createRelaySet(relayUrls: string[]): Set<string> { }
```

#### 5.2 Split Large Utils File

**Problem:** `src/lib/utils.ts` (285 lines) has mixed concerns

**Solution:** Split into focused files

**New file:** `src/lib/utils/formatting.ts` (~100 lines)
```typescript
export function shortenNpub(npub: string): string { }
export function shortenNevent(nevent: string): string { }
export function trimImageUrl(url: string): string { }
export function formatEventTimestamp(event: NDKEvent): string { }
```

**New file:** `src/lib/utils/validators.ts` (~50 lines)
```typescript
export function isHashtagOnlyQuery(query: string): boolean { }
export function isEmojiSearch(query: string): boolean { }
export function isValidNpub(npub: string): boolean { }
```

**Keep domain-specific logic where it belongs:**
- Event helpers → `src/lib/utils/eventHelpers.ts`
- Nostr identifiers → `src/lib/utils/nostrIdentifiers.ts`
- Text processing → `src/lib/utils/textUtils.ts`

#### 5.3 Consolidate Profile Utils

**Problem:** 15 files in `src/lib/profile/*` - some very small

**Review and group:**
- Merge `cache.ts` + `profile-event-cache.ts` → `caching.ts`
- Merge `key-utils.ts` into `utils.ts`
- Keep focused: `dvm-core.ts`, `fallback.ts`, `resolver.ts`, `search.ts`

**Target:** ~8-10 files instead of 15

---

## Priority 6: Extract Reusable Hooks

### Current Issues
- Logic duplicated across components
- Hard to reuse stateful logic
- Testing requires mounting full components

### Refactoring Strategy

**New file:** `src/hooks/useProfileData.ts` (~100 lines)

```typescript
export function useProfileData(pubkey: string) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch and cache profile
  }, [pubkey]);
  
  return { profile, loading, refresh };
}
```

**New file:** `src/hooks/useRelayStatus.ts` (~80 lines)

```typescript
export function useRelayStatus() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  
  useEffect(() => {
    const unsubscribe = addConnectionStatusListener(setStatus);
    return unsubscribe;
  }, []);
  
  return status;
}
```

**New file:** `src/hooks/useContentFiltering.ts` (~80 lines)

```typescript
export function useContentFiltering(
  events: NDKEvent[],
  filters: FilterSettings
) {
  return useMemo(() => {
    return applyContentFilters(events, filters);
  }, [events, filters]);
}
```

**New file:** `src/hooks/useDebounce.ts` (~30 lines)

```typescript
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}
```

**Benefits:**
- Reusable logic across components
- Easier to test
- Cleaner components
- Better separation of concerns

---

## Priority 7: Component Composition

### Strategy

For any component > 200 lines:
1. Identify sub-sections
2. Extract to separate components
3. Use composition

**Example:** `ClientFilters.tsx` (333 lines)

**Split into:**
- `FilterModeToggle.tsx` (~40 lines)
- `EmojiFilter.tsx` (~40 lines)
- `HashtagFilter.tsx` (~40 lines)
- `MentionFilter.tsx` (~40 lines)
- `BooleanFilters.tsx` (~50 lines)
- `FuzzySearch.tsx` (~60 lines)
- `ClientFilters.tsx` (~80 lines - composition)

---

## Implementation Plan

### Phase 1: Foundation (Days 1-2)

**Tasks:**
1. Create new directory structures
2. Set up barrel exports (index.ts files)
3. Extract and consolidate utilities
4. Create shared component stubs
5. Run build to ensure no breaks

**Deliverables:**
- `src/lib/relays/` directory structure
- `src/lib/ndk/` directory structure
- `src/lib/search/` directory structure
- `src/components/shared/` directory
- Consolidated utility files

### Phase 2: Core Logic (Days 3-5)

**Tasks:**
1. Refactor search.ts into modules
   - Extract query processing
   - Extract subscription logic
   - Extract search strategies
   - Create orchestrator
2. Split relay management
   - Config, discovery, info, sets
3. Split NDK utilities
   - Cache, connection, subscribe
4. Update all imports
5. Test search functionality

**Deliverables:**
- Modular search system
- Modular relay system
- Modular NDK system
- All tests passing

### Phase 3: Components (Days 6-8)

**Tasks:**
1. Break down SearchView
   - Extract hooks
   - Extract renderers
   - Create composition
2. Extract shared component pieces
   - LinkButton, PortalMenu, etc.
3. Simplify ProfileCard and EventCard
4. Update component imports
5. Visual regression testing

**Deliverables:**
- Modular SearchView
- Shared UI components
- Simplified ProfileCard
- Simplified EventCard
- UI working correctly

### Phase 4: Polish (Days 9-10)

**Tasks:**
1. Review all files for 210-line compliance
2. Fix any remaining violations
3. Clean up unused code
4. Update documentation
5. Final testing pass
6. Create migration guide

**Deliverables:**
- All files < 210 lines
- Updated documentation
- Migration guide
- Clean codebase

---

## Success Metrics

### Quantitative
- ✅ **No files > 210 lines**
- ✅ **Reduced duplication** (measure with tools)
- ✅ **Increased test coverage** (easier to test smaller units)
- ✅ **Faster build times** (better tree-shaking)

### Qualitative
- ✅ **Easier to navigate** (find code quickly)
- ✅ **Easier to understand** (clear file purposes)
- ✅ **Easier to modify** (changes localized)
- ✅ **Better git diffs** (smaller, focused commits)
- ✅ **Faster onboarding** (new developers understand structure)

---

## Commit Strategy

Use conventional commits after each major change:

```bash
git commit -m "refactor(search): extract query processing utilities"
git commit -m "refactor(search): extract subscription logic"
git commit -m "refactor(search): split search strategies into modules"
git commit -m "refactor(search): create main search orchestrator"

git commit -m "refactor(relays): split into config, discovery, info, sets"
git commit -m "refactor(ndk): split into cache, connection, subscribe"

git commit -m "refactor(components): extract SearchView state hook"
git commit -m "refactor(components): extract SearchView search logic"
git commit -m "refactor(components): extract SearchView renderers"
git commit -m "refactor(components): create SearchView composition"

git commit -m "refactor(shared): create LinkButton component"
git commit -m "refactor(shared): create PortalMenu component"
git commit -m "refactor(shared): create MetadataRow component"

git commit -m "refactor(ProfileCard): use shared components"
git commit -m "refactor(EventCard): use shared components"

git commit -m "refactor(utils): consolidate URL utilities"
git commit -m "refactor(utils): split large utils file"

git commit -m "docs: update REFACTORING.md with progress"
```

Always commit after each file extraction so changes can be easily reverted if needed.

---

## Risk Mitigation

### Testing Strategy
1. **Unit tests** for extracted utilities
2. **Integration tests** for search functionality
3. **Visual regression tests** for UI components
4. **Manual testing** after each phase

### Rollback Plan
- Each commit is atomic and revertable
- Keep original structure until new one is verified
- Use feature flags if needed for gradual rollout

### Communication
- Document changes in commit messages
- Update README.md with new structure
- Create migration guide for contributors
- Announce changes before merging

---

## Post-Refactoring Benefits

### Developer Experience
- **Faster navigation**: Find code in 1-2 clicks instead of scrolling
- **Easier debugging**: Isolated code is easier to trace
- **Better IDE support**: Smaller files = faster autocomplete
- **Cleaner git history**: Smaller diffs, easier reviews

### Code Quality
- **Testability**: Small units are easy to test
- **Maintainability**: Clear responsibilities
- **Reusability**: Shared utilities and components
- **Scalability**: Easy to add new features

### Team Productivity
- **Onboarding**: New developers understand structure faster
- **Parallel work**: Less merge conflicts
- **Code reviews**: Faster, more focused reviews
- **Refactoring**: Safer to make changes

---

## Future Improvements

After this refactoring is complete, consider:

1. **TypeScript strict mode**: Better type safety
2. **Component library**: Storybook for shared components
3. **Performance monitoring**: Track bundle size
4. **Automated testing**: E2E tests for critical paths
5. **Documentation**: JSDoc comments for public APIs
6. **Linting rules**: Enforce file size limits

---

## Questions & Answers

### Q: Won't this create too many files?
**A:** Better to have many small, focused files than few large, complex files. Modern IDEs handle file navigation well. The key is good organization and clear naming.

### Q: How do we handle imports?
**A:** Use barrel exports (index.ts) to maintain clean import paths. Example:
```typescript
// Before: import { searchEvents } from '@/lib/search';
// After: still: import { searchEvents } from '@/lib/search';
// (index.ts re-exports from sub-modules)
```

### Q: What about performance?
**A:** Modern bundlers (Next.js uses webpack/turbopack) handle tree-shaking well. Splitting files won't affect runtime performance. Build times may improve due to better caching.

### Q: How do we enforce the 210-line limit?
**A:** Add a pre-commit hook or CI check:
```bash
#!/bin/bash
MAX_LINES=210
violations=$(find src -name "*.ts" -o -name "*.tsx" | \
  xargs wc -l | awk -v max=$MAX_LINES '$1 > max {print}')
if [ -n "$violations" ]; then
  echo "Files exceeding $MAX_LINES lines:"
  echo "$violations"
  exit 1
fi
```

---

## Conclusion

This refactoring plan will transform the ants codebase into a more maintainable, testable, and developer-friendly application. By breaking down large files into focused modules, eliminating duplication, and following the single responsibility principle, we'll make the codebase easier to understand, modify, and extend.

The key is to proceed methodically, test frequently, and commit often. Each phase builds on the previous one, so we can validate our work at every step.

Let's build something great! 🐜

