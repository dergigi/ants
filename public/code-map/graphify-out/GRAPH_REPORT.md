# Graph Report - docs/code-map  (2026-07-22)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 937 nodes · 2608 edges · 41 clusters (35 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `129dbecf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Cluster Hubs (Navigation)
- Profile Resolution and Caches
- Search View and Query State
- Search Parsing and Subscriptions
- NDK Connections and Relay Status
- Routes and Nostr Identifier Utilities
- Runtime Dependencies
- App Shell and Commands
- Relay Configuration and Discovery
- Package Scripts and Dev Tooling
- TypeScript Project Configuration
- Event Kind Metadata and Replacements
- URL Previews and Image Search
- Search Examples and Smoke Checks
- Lightning Profile Signals
- Relative Time and Browser Helpers
- Follow Pack and Profile UI
- Content Rendering Helpers
- Zap History and Profile Age
- Longform Article Rendering
- Media Extraction and Display
- Search Results and imeta Images
- Profile Cards and Raw Events
- Highlights Rendering
- Open Graph API Route
- Markdown and Nostr Links
- Event Cards and Explorer Actions
- Code Snippet Highlighting
- Card Action Buttons
- Prism Module Declarations
- Profile Banner Controls
- External Explorer Portals
- ESLint Configuration
- Next.js Build Metadata
- Explorer Portal Menu
- NIP-05 Well-Known Route
- Expanded Filter Panel
- Expanded Relay Panel
- PostCSS Configuration

## God Nodes (most connected - your core abstractions)
1. `subscribeAndCollect()` - 33 edges
2. `safeSubscribe()` - 27 edges
3. `ndk` - 24 edges
4. `hasLocalStorage()` - 24 edges
5. `sortEventsNewestFirst()` - 24 edges
6. `searchProfilesFullText()` - 23 edges
7. `useSearchExecution()` - 22 edges
8. `getStoredPubkey()` - 22 edges
9. `resolveAuthor()` - 21 edges
10. `searchEvents()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `expectResultDatesWithinRange()` --calls--> `parseDateValue()`  [EXTRACTED]
  e2e/search-smoke.spec.ts → src/lib/search/relativeDates.ts
- `calculateRelayCounts()` --indirect_call--> `canonicalRelayId()`  [INFERRED]
  src/lib/relayCounts.ts → src/lib/urlUtils.ts
- `loadCacheFromStorage()` --calls--> `loadMapFromStorage()`  [EXTRACTED]
  src/lib/relays/infoCache.ts → src/lib/storageCache.ts
- `GET()` --calls--> `normalizeNip05String()`  [EXTRACTED]
  src/app/api/nip05/verify/route.ts → src/lib/nip05.ts
- `PidPage()` --calls--> `useNostrUser()`  [EXTRACTED]
  src/app/p/[id]/page.tsx → src/hooks/useNostrUser.ts

## Import Cycles
- 2-file cycle: `src/lib/utils.ts -> src/lib/utils/nostrIdentifiers.ts -> src/lib/utils.ts`
- 2-file cycle: `src/lib/ndk/index.ts -> src/lib/ndk/subscribe.ts -> src/lib/ndk/index.ts`
- 3-file cycle: `src/lib/ndk/connection.ts -> src/lib/ndk/subscribe.ts -> src/lib/ndk/index.ts -> src/lib/ndk/connection.ts`
- 3-file cycle: `src/lib/ndk/index.ts -> src/lib/ndk/subscribe.ts -> src/lib/utils/filterReduce.ts -> src/lib/ndk/index.ts`
- 3-file cycle: `src/lib/nip07.ts -> src/lib/relays/index.ts -> src/lib/relays/nip50.ts -> src/lib/nip07.ts`
- 3-file cycle: `src/lib/ndk/index.ts -> src/lib/nip07.ts -> src/lib/relays/index.ts -> src/lib/ndk/index.ts`
- 3-file cycle: `src/lib/nip07.ts -> src/lib/relays/index.ts -> src/lib/relays/userDiscovery.ts -> src/lib/nip07.ts`
- 4-file cycle: `src/lib/ndk/index.ts -> src/lib/nip07.ts -> src/lib/profile/cache.ts -> src/lib/profile/eventStorage.ts -> src/lib/ndk/index.ts`
- 4-file cycle: `src/lib/ndk/connection.ts -> src/lib/ndk/subscribe.ts -> src/lib/utils/filterReduce.ts -> src/lib/ndk/index.ts -> src/lib/ndk/connection.ts`
- 4-file cycle: `src/lib/nip07.ts -> src/lib/relays/index.ts -> src/lib/relays/nip50.ts -> src/lib/relays/userDiscovery.ts -> src/lib/nip07.ts`
- 4-file cycle: `src/lib/ndk/index.ts -> src/lib/nip07.ts -> src/lib/relays/index.ts -> src/lib/relays/infoCache.ts -> src/lib/ndk/index.ts`
- 4-file cycle: `src/lib/ndk/index.ts -> src/lib/nip07.ts -> src/lib/relays/index.ts -> src/lib/relays/userDiscovery.ts -> src/lib/ndk/index.ts`
- 5-file cycle: `src/lib/ndk/index.ts -> src/lib/nip07.ts -> src/lib/profile/cache.ts -> src/lib/profile/profile-event-cache.ts -> src/lib/profile/eventStorage.ts -> src/lib/ndk/index.ts`
- 5-file cycle: `src/lib/ndk/index.ts -> src/lib/nip07.ts -> src/lib/profile/cache.ts -> src/lib/profile/username-cache.ts -> src/lib/profile/eventStorage.ts -> src/lib/ndk/index.ts`
- 5-file cycle: `src/lib/ndk/index.ts -> src/lib/nip07.ts -> src/lib/relays/index.ts -> src/lib/relays/nip50.ts -> src/lib/relays/infoCache.ts -> src/lib/ndk/index.ts`
- 5-file cycle: `src/lib/ndk/index.ts -> src/lib/nip07.ts -> src/lib/relays/index.ts -> src/lib/relays/nip50.ts -> src/lib/relays/userDiscovery.ts -> src/lib/ndk/index.ts`

## Clusters (41 total, 6 thin omitted)

### Profile Resolution and Caches
Cohesion: 0.05
Nodes (103): GET(), getDomainWithoutTld(), Nip05CheckResult, Nip05Display(), useNip05Status(), useNostrUser(), trackEventRelay(), markRelayActivity() (+95 more)

### Search View and Query State
Cohesion: 0.05
Nodes (70): FilterMode, FilterSettings, NumberFilterProps, Props, FilterCollapsed(), FilterCollapsedProps, QueryTranslation(), QueryTranslationProps (+62 more)

### Search Parsing and Subscriptions
Cohesion: 0.13
Nodes (53): relaySets, fetchEventByIdentifier(), getPubkey(), isNpub(), sanitizeRelayUrls(), searchByNip19Identifier(), extractByTokens(), extractCoreWithoutByAndTags() (+45 more)

### NDK Connections and Relay Status
Cohesion: 0.08
Nodes (48): InlineAuthor(), Props, InlineNostrToken(), InlineNostrTokenProps, NostrProfileLink(), NostrProfileLinkProps, RelayInfo, RelayStatusDisplay() (+40 more)

### Routes and Nostr Identifier Utilities
Cohesion: 0.07
Nodes (41): EidRedirectPage(), PidPage(), HashtagsPage(), LoadingLayout(), LoadingLayoutProps, PlaceholderProps, PlaceholderStyles(), ProfileCardPlaceholder() (+33 more)

### Runtime Dependencies
Cohesion: 0.04
Nodes (49): blurhash, fetch-opengraph, @fortawesome/fontawesome-svg-core, @fortawesome/free-brands-svg-icons, @fortawesome/free-regular-svg-icons, @fortawesome/free-solid-svg-icons, @fortawesome/react-fontawesome, fuse.js (+41 more)

### App Shell and Commands
Cohesion: 0.08
Nodes (34): geistMono, geistSans, metadata, Footer(), Header(), Logo(), LogoProps, Props (+26 more)

### Relay Configuration and Discovery
Cohesion: 0.12
Nodes (33): createRelaySet(), normalizeRelayUrl(), RELAYS, CachedRelayInfo, cacheRelayInfo(), checkRelayInfoViaHttp(), clearRelayInfoCache(), getRelayInfo() (+25 more)

### Package Scripts and Dev Tooling
Cohesion: 0.05
Nodes (37): eslint, eslint-config-next, @eslint/eslintrc, jest, devDependencies, eslint, eslint-config-next, @eslint/eslintrc (+29 more)

### TypeScript Project Configuration
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, nostr-band-app, npub.world (+21 more)

### Event Kind Metadata and Replacements
Cohesion: 0.12
Nodes (22): NoteHeader(), NoteHeaderProps, RelayIndicator(), RelayIndicatorProps, EVENT_KIND_ICONS, getEventKindDisplayName(), getEventKindIcon(), getKindSearchQuery() (+14 more)

### URL Previews and Image Search
Cohesion: 0.16
Nodes (13): ImageWithBlurhash(), ImageWithBlurhashProps, ReverseImageSearchButton(), ReverseImageSearchButtonProps, SearchIconButton(), SearchIconButtonProps, OgData, Props (+5 more)

### Search Examples and Smoke Checks
Cohesion: 0.16
Nodes (16): DateExpectation, exampleSet, expectResultDatesWithinRange(), getCardExactTimestamp(), smokeQueries, SmokeQuery, loginRequiredExamples, SearchExample (+8 more)

### Lightning Profile Signals
Cohesion: 0.15
Nodes (18): DebugState, defaultState, Props, RankingDebug(), buildFilters(), getCachedLightningFlag(), getCachedLightningRealness(), inFlight (+10 more)

### Relative Time and Browser Helpers
Cohesion: 0.21
Nodes (14): calculateTimeDifferences(), formatMobileRelativeTime(), formatRelativeTime(), formatRelativeTimeAuto(), formatters, isMobileViewport(), MOBILE_UNIT_SUFFIXES, MobileRelativeUnit (+6 more)

### Follow Pack and Profile UI
Cohesion: 0.23
Nodes (10): FollowPackCard(), FollowPackCardProps, FollowPackData, ProfileImage(), ProfileImageProps, ProfileScopeIndicator(), ProfileScopeIndicatorProps, getIsKindTokens() (+2 more)

### Content Rendering Helpers
Cohesion: 0.25
Nodes (11): NeventSearchButton(), Props, ContentRenderer, useContentRenderer(), formatEventTimestamp(), getReplyToEventId(), createNostrTokenRegex(), normalizeWhitespace() (+3 more)

### Zap History and Profile Age
Cohesion: 0.25
Nodes (12): cleanLightningAddress(), ProfileCreatedAt(), Props, buildNutzapFilters(), buildZapFilters(), LightningFilterFactory, nutzapSenderCache, useHasSentNutzap() (+4 more)

### Longform Article Rendering
Cohesion: 0.26
Nodes (9): ArticleCard(), ArticleCardProps, ArticleHeader(), encodeNevent(), createArticleExplorerItems(), ArticleMetadata, extractArticleMetadata(), formatArticleDate() (+1 more)

### Media Extraction and Display
Cohesion: 0.20
Nodes (17): NoteMedia(), NoteMediaProps, extractMediaFromContent(), getSearchQueryFromMedia(), getTrimmedMediaUrl(), isValidMediaUrl(), MediaItem, cleanUrlBase() (+9 more)

### Search Results and imeta Images
Cohesion: 0.38
Nodes (9): Props, SearchResultsList(), extractImetaBlurhashes(), extractImetaDimensions(), extractImetaHashes(), extractImetaImageUrls(), extractImetaVideoUrls(), isHttpUrl() (+1 more)

### Profile Cards and Raw Events
Cohesion: 0.26
Nodes (8): CopyButton(), Props, ProfileCard(), ProfileCardProps, Props, RawEventJson(), createProfileExplorerItems(), toPlainEvent()

### Highlights Rendering
Cohesion: 0.21
Nodes (7): EventCardHighlight(), HIGHLIGHT_SPAN_STYLE, navigateToSearch(), Props, SearchButton(), HighlightData, formatUrlResponsive()

### Open Graph API Route
Cohesion: 0.35
Nodes (10): fetchOgData(), fetchYouTubeOg(), GET(), getYouTubeIdFromUrl(), isBlockedHostname(), isHttpUrl(), isPrivateIp(), OgResult (+2 more)

### Markdown and Nostr Links
Cohesion: 0.31
Nodes (9): ArticleMarkdown(), ArticleMarkdownProps, joinClasses(), withoutNode(), NOSTR_TOKEN_RE, PROFILE_PREFIXES, remarkNostrLinks(), tokenToDisplay() (+1 more)

### Event Cards and Explorer Actions
Cohesion: 0.27
Nodes (6): EventCard(), Props, UI_CONFIG, parseFollowPackTags(), parseHighlightEvent(), createEventExplorerItems()

### Code Snippet Highlighting
Cohesion: 0.36
Nodes (8): CodeSnippet(), extractLanguageFromTags(), Props, ensureBashLanguage(), ensureLanguage(), exposePrism(), importers, loadedLanguages

### Card Action Buttons
Cohesion: 0.28
Nodes (5): CardActions, Props, IconButton, Props, ShareButtonProps

### Prism Module Declarations
Cohesion: 0.25
Nodes (7): prismjs/components/prism-bash, prismjs/components/prism-css, prismjs/components/prism-java, prismjs/components/prism-javascript, prismjs/components/prism-json, prismjs/components/prism-markdown, prismjs/components/prism-typescript

### Profile Banner Controls
Cohesion: 0.40
Nodes (3): Props, Props, TitleBarButton

### External Explorer Portals
Cohesion: 0.33
Nodes (5): ARTICLE_EXPLORERS, EVENT_EXPLORERS, ExplorerItem, ExplorerLink, PROFILE_EXPLORERS

### ESLint Configuration
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

## Knowledge Gaps
- **223 isolated node(s):** `DateExpectation`, `SmokeQuery`, `smokeQueries`, `exampleSet`, `__filename` (+218 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin clusters (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Runtime Dependencies` to `Package Scripts and Dev Tooling`?**
  _High betweenness centrality (0.092) - this node is a cross-cluster bridge._
- **Why does `ndk` connect `NDK Connections and Relay Status` to `Profile Resolution and Caches`, `Search View and Query State`, `Search Parsing and Subscriptions`, `App Shell and Commands`, `Relay Configuration and Discovery`, `Follow Pack and Profile UI`, `Longform Article Rendering`?**
  _High betweenness centrality (0.048) - this node is a cross-cluster bridge._
- **What connects `DateExpectation`, `SmokeQuery`, `smokeQueries` to the rest of the system?**
  _223 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Profile Resolution and Caches` be split into smaller, more focused modules?**
  _Cohesion score 0.05432258064516129 - nodes in this cluster are weakly interconnected._
- **Should `Search View and Query State` be split into smaller, more focused modules?**
  _Cohesion score 0.05444978265843056 - nodes in this cluster are weakly interconnected._
- **Should `Search Parsing and Subscriptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1263318112633181 - nodes in this cluster are weakly interconnected._
- **Should `NDK Connections and Relay Status` be split into smaller, more focused modules?**
  _Cohesion score 0.07759562841530054 - nodes in this cluster are weakly interconnected._