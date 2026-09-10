# Code Graph Report

Generated from `graph.json` by `scripts/code-map-report.py`.

## Summary

- 937 nodes · 2608 edges · 41 clusters (all shown)
- Extraction: 99.58% EXTRACTED (2597 edges) · 0.42% INFERRED (11 edges)

## Graph Freshness

- Built from commit: `129dbecf0419608fc7e5f307b307da1287eaf560`
- This is a snapshot; compare that commit with the current checkout before relying on it.

## Cluster Hubs

- Profile Resolution and Caches (125 nodes)
- Search View and Query State (94 nodes)
- Search Parsing and Subscriptions (73 nodes)
- NDK Connections and Relay Status (61 nodes)
- Routes and Nostr Identifier Utilities (59 nodes)
- Runtime Dependencies (49 nodes)
- App Shell and Commands (48 nodes)
- Relay Configuration and Discovery (40 nodes)
- Package Scripts and Dev Tooling (38 nodes)
- TypeScript Project Configuration (30 nodes)
- Event Kind Metadata and Replacements (30 nodes)
- URL Previews and Image Search (21 nodes)
- Search Examples and Smoke Checks (20 nodes)
- Lightning Profile Signals (20 nodes)
- Relative Time and Browser Helpers (16 nodes)
- Follow Pack and Profile UI (15 nodes)
- Content Rendering Helpers (15 nodes)
- Zap History and Profile Age (14 nodes)
- Longform Article Rendering (13 nodes)
- Media Extraction and Display (21 nodes)
- Search Results and imeta Images (12 nodes)
- Profile Cards and Raw Events (12 nodes)
- Highlights Rendering (12 nodes)
- Open Graph API Route (11 nodes)
- Markdown and Nostr Links (11 nodes)
- Event Cards and Explorer Actions (11 nodes)
- Code Snippet Highlighting (10 nodes)
- Card Action Buttons (9 nodes)
- Prism Module Declarations (8 nodes)
- Profile Banner Controls (6 nodes)
- External Explorer Portals (6 nodes)
- ESLint Configuration (5 nodes)
- Next.js Build Metadata (4 nodes)
- Explorer Portal Menu (4 nodes)
- NIP-05 Well-Known Route (3 nodes)
- Expanded Filter Panel (3 nodes)
- Expanded Relay Panel (3 nodes)
- PostCSS Configuration (2 nodes)
- Jest Configuration (1 nodes)
- Playwright Configuration (1 nodes)
- Regex Scratch Script (1 nodes)

## Most Connected Nodes

1. `ndk/index.ts` — 58 incident edges; `src/lib/ndk/index.ts`
2. `SearchView.tsx` — 55 incident edges; `src/components/SearchView.tsx`
3. `profile/cache.ts` — 53 incident edges; `src/lib/profile/cache.ts`
4. `profile/index.ts` — 43 incident edges; `src/lib/profile/index.ts`
5. `lib/utils.ts` — 40 incident edges; `src/lib/utils.ts`
6. `SearchResultsList.tsx` — 40 incident edges; `src/components/SearchResultsList.tsx`
7. `relays/index.ts` — 39 incident edges; `src/lib/relays/index.ts`
8. `vertex.ts` — 38 incident edges; `src/lib/vertex.ts`
9. `useSearchExecution.ts` — 36 incident edges; `src/hooks/useSearchExecution.ts`
10. `subscribeAndCollect()` — 33 incident edges; `src/lib/search/subscriptions.ts`

## Clusters (41 total, all shown)

### Profile Resolution and Caches

Nodes (125): `verify/route.ts`, `GET()`, `Nip05Display.tsx`, `getDomainWithoutTld()`, `Nip05CheckResult`, `useNip05Status()`, `Nip05Display()`, `useNostrUser.ts` (+117 more)

### Search View and Query State

Nodes (94): `app/page.tsx`, `Home()`, `ClientFilters.tsx`, `FilterMode`, `FilterSettings`, `Props`, `NumberFilterProps`, `NumberFilter()` (+86 more)

### Search Parsing and Subscriptions

Nodes (73): `relaySets`, `lib/search.ts`, `searchEvents()`, `idLookup.ts`, `isNpub()`, `getPubkey()`, `sanitizeRelayUrls()`, `fetchEventByIdentifier()` (+65 more)

### NDK Connections and Relay Status

Nodes (61): `InlineAuthor.tsx`, `Props`, `InlineAuthor()`, `InlineNostrToken.tsx`, `InlineNostrTokenProps`, `InlineNostrToken()`, `NostrProfileLink.tsx`, `NostrProfileLinkProps` (+53 more)

### Routes and Nostr Identifier Utilities

Nodes (59): `e/[id]/page.tsx`, `EidRedirectPage()`, `p/[id]/page.tsx`, `PidPage()`, `[hashtags]/page.tsx`, `HashtagsPage()`, `LoadingLayout.tsx`, `LoadingLayoutProps` (+51 more)

### Runtime Dependencies

Nodes (49): `dependencies`, `@fortawesome/fontawesome-svg-core`, `@fortawesome/fontawesome-svg-core`, `@fortawesome/free-brands-svg-icons`, `@fortawesome/free-brands-svg-icons`, `@fortawesome/free-regular-svg-icons`, `@fortawesome/free-regular-svg-icons`, `@fortawesome/free-solid-svg-icons` (+41 more)

### App Shell and Commands

Nodes (48): `layout.tsx`, `geistSans`, `geistMono`, `metadata`, `RootLayout()`, `Footer.tsx`, `Footer()`, `Header.tsx` (+40 more)

### Relay Configuration and Discovery

Nodes (40): `config.ts`, `RELAYS`, `normalizeRelayUrl()`, `createRelaySet()`, `relays/index.ts`, `infoCache.ts`, `RelayInfo`, `CachedRelayInfo` (+32 more)

### Package Scripts and Dev Tooling

Nodes (38): `package.json`, `name`, `version`, `private`, `scripts`, `dev`, `build`, `start` (+30 more)

### TypeScript Project Configuration

Nodes (30): `tsconfig.json`, `compilerOptions`, `target`, `lib`, `dom`, `dom.iterable`, `esnext`, `allowJs` (+22 more)

### Event Kind Metadata and Replacements

Nodes (30): `NoteHeader.tsx`, `NoteHeaderProps`, `NoteHeader()`, `RelayIndicator.tsx`, `RelayIndicatorProps`, `RelayIndicator()`, `eventKindIcons.ts`, `EVENT_KIND_ICONS` (+22 more)

### URL Previews and Image Search

Nodes (21): `ImageWithBlurhash.tsx`, `ImageWithBlurhashProps`, `ImageWithBlurhash()`, `ReverseImageSearchButton.tsx`, `ReverseImageSearchButtonProps`, `ReverseImageSearchButton()`, `SearchIconButton.tsx`, `SearchIconButtonProps` (+13 more)

### Search Examples and Smoke Checks

Nodes (20): `search-smoke.spec.ts`, `DateExpectation`, `SmokeQuery`, `smokeQueries`, `exampleSet`, `getResultCards()`, `getCardExactTimestamp()`, `expectResultDatesWithinRange()` (+12 more)

### Lightning Profile Signals

Nodes (20): `RankingDebug.tsx`, `Props`, `DebugState`, `defaultState`, `RankingDebug()`, `lightning.ts`, `LightningFlagType`, `LightningRealness` (+12 more)

### Relative Time and Browser Helpers

Nodes (16): `relativeTime.ts`, `formatters`, `MOBILE_UNIT_SUFFIXES`, `MobileRelativeUnit`, `formatMobileRelativeTime()`, `isMobileViewport()`, `calculateTimeDifferences()`, `formatRelativeTime()` (+8 more)

### Follow Pack and Profile UI

Nodes (15): `FollowPackCard.tsx`, `FollowPackData`, `FollowPackCardProps`, `FollowPackMemberAvatar()`, `FollowPackCard()`, `ProfileImage.tsx`, `ProfileImageProps`, `ProfileImage()` (+7 more)

### Content Rendering Helpers

Nodes (15): `NeventSearchButton.tsx`, `Props`, `NeventSearchButton()`, `useContentRenderer.tsx`, `ContentRenderer`, `useContentRenderer()`, `eventHelpers.ts`, `formatEventTimestamp()` (+7 more)

### Zap History and Profile Age

Nodes (14): `ProfileCreatedAt.tsx`, `cleanLightningAddress()`, `Props`, `ProfileCreatedAt()`, `useHasSentZap.ts`, `zapSenderCache`, `nutzapSenderCache`, `LightningFilterFactory` (+6 more)

### Longform Article Rendering

Nodes (13): `ArticleCard.tsx`, `ArticleCardProps`, `ArticleCard()`, `encodeNevent()`, `ArticleHeader()`, `ArticleBody()`, `ArticleTopics()`, `createArticleExplorerItems()` (+5 more)

### Media Extraction and Display

Nodes (21): `NoteMedia.tsx`, `NoteMediaProps`, `NoteMedia()`, `mediaUtils.ts`, `MediaItem`, `extractMediaFromContent()`, `getSearchQueryFromMedia()`, `isValidMediaUrl()` (+13 more)

### Search Results and imeta Images

Nodes (12): `SearchResultsList.tsx`, `Props`, `SearchResultsList()`, `picture.ts`, `isHttpUrl()`, `extractImetaImageUrls()`, `extractImetaVideoUrls()`, `extractImetaBlurhashes()` (+4 more)

### Profile Cards and Raw Events

Nodes (12): `CopyButton.tsx`, `Props`, `CopyButton()`, `ProfileCard.tsx`, `ProfileCardProps`, `ProfileCard()`, `RawEventJson.tsx`, `Props` (+4 more)

### Highlights Rendering

Nodes (12): `EventCardHighlight.tsx`, `navigateToSearch()`, `SearchButton()`, `HIGHLIGHT_SPAN_STYLE`, `Props`, `EventCardHighlight()`, `highlights.ts`, `HighlightData` (+4 more)

### Open Graph API Route

Nodes (11): `og/route.ts`, `OgResult`, `isHttpUrl()`, `isBlockedHostname()`, `isPrivateIp()`, `resolveUrlMaybe()`, `getYouTubeIdFromUrl()`, `fetchYouTubeOg()` (+3 more)

### Markdown and Nostr Links

Nodes (11): `ArticleMarkdown.tsx`, `ArticleMarkdownProps`, `joinClasses()`, `withoutNode()`, `ArticleMarkdown()`, `remarkNostrLinks.ts`, `NOSTR_TOKEN_RE`, `PROFILE_PREFIXES` (+3 more)

### Event Cards and Explorer Actions

Nodes (11): `AuthorBadge.tsx`, `AuthorBadge()`, `EventCard.tsx`, `Props`, `EventCard()`, `constants.ts`, `UI_CONFIG`, `followPack.ts` (+3 more)

### Code Snippet Highlighting

Nodes (10): `CodeSnippet.tsx`, `Props`, `extractLanguageFromTags()`, `CodeSnippet()`, `prism.ts`, `loadedLanguages`, `exposePrism()`, `importers` (+2 more)

### Card Action Buttons

Nodes (9): `CardActions.tsx`, `Props`, `CardActions`, `IconButton.tsx`, `Props`, `IconButton`, `ShareButton.tsx`, `ShareButtonProps` (+1 more)

### Prism Module Declarations

Nodes (8): `prism-modules.d.ts`, `prismjs/components/prism-bash`, `prismjs/components/prism-typescript`, `prismjs/components/prism-javascript`, `prismjs/components/prism-json`, `prismjs/components/prism-css`, `prismjs/components/prism-markdown`, `prismjs/components/prism-java`

### Profile Banner Controls

Nodes (6): `ProfileBanner.tsx`, `Props`, `ProfileBanner()`, `TitleBarButton.tsx`, `Props`, `TitleBarButton`

### External Explorer Portals

Nodes (6): `portals.ts`, `ExplorerLink`, `PROFILE_EXPLORERS`, `EVENT_EXPLORERS`, `ARTICLE_EXPLORERS`, `ExplorerItem`

### ESLint Configuration

Nodes (5): `eslint.config.mjs`, `__filename`, `__dirname`, `compat`, `eslintConfig`

### Next.js Build Metadata

Nodes (4): `next.config.ts`, `getGitCommitHash()`, `getGitCommitHashShort()`, `nextConfig`

### Explorer Portal Menu

Nodes (4): `ExplorerPortalMenu.tsx`, `ExplorerMenuItem`, `Props`, `ExplorerPortalMenu()`

### NIP-05 Well-Known Route

Nodes (3): `nostr.json/route.ts`, `NIP05_DATA`, `GET()`

### Expanded Filter Panel

Nodes (3): `FilterExpanded.tsx`, `FilterExpandedProps`, `FilterExpanded()`

### Expanded Relay Panel

Nodes (3): `RelayExpanded.tsx`, `RelayExpandedProps`, `RelayExpanded()`

### PostCSS Configuration

Nodes (2): `postcss.config.mjs`, `config`

### Jest Configuration

Nodes (1): `jest.config.js`

### Playwright Configuration

Nodes (1): `playwright.config.ts`

### Regex Scratch Script

Nodes (1): `test-regex.js`

## Limitations

- 3 nodes have no recorded edges.
- Static extraction can miss runtime connections; inferred edges are not verified dependencies.
- Cluster names are heuristic descriptions, not architectural boundaries.
