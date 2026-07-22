# Graph Report - docs/code-map  (2026-07-22)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 937 nodes · 2608 edges · 41 communities (35 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `129dbecf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38

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

## Communities (41 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (103): GET(), getDomainWithoutTld(), Nip05CheckResult, Nip05Display(), useNip05Status(), useNostrUser(), trackEventRelay(), markRelayActivity() (+95 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (70): FilterMode, FilterSettings, NumberFilterProps, Props, FilterCollapsed(), FilterCollapsedProps, QueryTranslation(), QueryTranslationProps (+62 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (53): relaySets, fetchEventByIdentifier(), getPubkey(), isNpub(), sanitizeRelayUrls(), searchByNip19Identifier(), extractByTokens(), extractCoreWithoutByAndTags() (+45 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (48): InlineAuthor(), Props, InlineNostrToken(), InlineNostrTokenProps, NostrProfileLink(), NostrProfileLinkProps, RelayInfo, RelayStatusDisplay() (+40 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (41): EidRedirectPage(), PidPage(), HashtagsPage(), LoadingLayout(), LoadingLayoutProps, PlaceholderProps, PlaceholderStyles(), ProfileCardPlaceholder() (+33 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (49): blurhash, fetch-opengraph, @fortawesome/fontawesome-svg-core, @fortawesome/free-brands-svg-icons, @fortawesome/free-regular-svg-icons, @fortawesome/free-solid-svg-icons, @fortawesome/react-fontawesome, fuse.js (+41 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (34): geistMono, geistSans, metadata, Footer(), Header(), Logo(), LogoProps, Props (+26 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (33): createRelaySet(), normalizeRelayUrl(), RELAYS, CachedRelayInfo, cacheRelayInfo(), checkRelayInfoViaHttp(), clearRelayInfoCache(), getRelayInfo() (+25 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (37): eslint, eslint-config-next, @eslint/eslintrc, jest, devDependencies, eslint, eslint-config-next, @eslint/eslintrc (+29 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, nostr-band-app, npub.world (+21 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (22): NoteHeader(), NoteHeaderProps, RelayIndicator(), RelayIndicatorProps, EVENT_KIND_ICONS, getEventKindDisplayName(), getEventKindIcon(), getKindSearchQuery() (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (13): ImageWithBlurhash(), ImageWithBlurhashProps, ReverseImageSearchButton(), ReverseImageSearchButtonProps, SearchIconButton(), SearchIconButtonProps, OgData, Props (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (16): DateExpectation, exampleSet, expectResultDatesWithinRange(), getCardExactTimestamp(), smokeQueries, SmokeQuery, loginRequiredExamples, SearchExample (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (18): DebugState, defaultState, Props, RankingDebug(), buildFilters(), getCachedLightningFlag(), getCachedLightningRealness(), inFlight (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.21
Nodes (14): calculateTimeDifferences(), formatMobileRelativeTime(), formatRelativeTime(), formatRelativeTimeAuto(), formatters, isMobileViewport(), MOBILE_UNIT_SUFFIXES, MobileRelativeUnit (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.23
Nodes (10): FollowPackCard(), FollowPackCardProps, FollowPackData, ProfileImage(), ProfileImageProps, ProfileScopeIndicator(), ProfileScopeIndicatorProps, getIsKindTokens() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (11): NeventSearchButton(), Props, ContentRenderer, useContentRenderer(), formatEventTimestamp(), getReplyToEventId(), createNostrTokenRegex(), normalizeWhitespace() (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (12): cleanLightningAddress(), ProfileCreatedAt(), Props, buildNutzapFilters(), buildZapFilters(), LightningFilterFactory, nutzapSenderCache, useHasSentNutzap() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.26
Nodes (9): ArticleCard(), ArticleCardProps, ArticleHeader(), encodeNevent(), createArticleExplorerItems(), ArticleMetadata, extractArticleMetadata(), formatArticleDate() (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.20
Nodes (17): NoteMedia(), NoteMediaProps, extractMediaFromContent(), getSearchQueryFromMedia(), getTrimmedMediaUrl(), isValidMediaUrl(), MediaItem, cleanUrlBase() (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.38
Nodes (9): Props, SearchResultsList(), extractImetaBlurhashes(), extractImetaDimensions(), extractImetaHashes(), extractImetaImageUrls(), extractImetaVideoUrls(), isHttpUrl() (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.26
Nodes (8): CopyButton(), Props, ProfileCard(), ProfileCardProps, Props, RawEventJson(), createProfileExplorerItems(), toPlainEvent()

### Community 22 - "Community 22"
Cohesion: 0.21
Nodes (7): EventCardHighlight(), HIGHLIGHT_SPAN_STYLE, navigateToSearch(), Props, SearchButton(), HighlightData, formatUrlResponsive()

### Community 23 - "Community 23"
Cohesion: 0.35
Nodes (10): fetchOgData(), fetchYouTubeOg(), GET(), getYouTubeIdFromUrl(), isBlockedHostname(), isHttpUrl(), isPrivateIp(), OgResult (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.31
Nodes (9): ArticleMarkdown(), ArticleMarkdownProps, joinClasses(), withoutNode(), NOSTR_TOKEN_RE, PROFILE_PREFIXES, remarkNostrLinks(), tokenToDisplay() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.27
Nodes (6): EventCard(), Props, UI_CONFIG, parseFollowPackTags(), parseHighlightEvent(), createEventExplorerItems()

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (8): CodeSnippet(), extractLanguageFromTags(), Props, ensureBashLanguage(), ensureLanguage(), exposePrism(), importers, loadedLanguages

### Community 27 - "Community 27"
Cohesion: 0.28
Nodes (5): CardActions, Props, IconButton, Props, ShareButtonProps

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (7): prismjs/components/prism-bash, prismjs/components/prism-css, prismjs/components/prism-java, prismjs/components/prism-javascript, prismjs/components/prism-json, prismjs/components/prism-markdown, prismjs/components/prism-typescript

### Community 30 - "Community 30"
Cohesion: 0.40
Nodes (3): Props, Props, TitleBarButton

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (5): ARTICLE_EXPLORERS, EVENT_EXPLORERS, ExplorerItem, ExplorerLink, PROFILE_EXPLORERS

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

## Knowledge Gaps
- **223 isolated node(s):** `DateExpectation`, `SmokeQuery`, `smokeQueries`, `exampleSet`, `__filename` (+218 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 5` to `Community 8`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `ndk` connect `Community 3` to `Community 0`, `Community 1`, `Community 2`, `Community 6`, `Community 7`, `Community 15`, `Community 18`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `DateExpectation`, `SmokeQuery`, `smokeQueries` to the rest of the system?**
  _223 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05432258064516129 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05444978265843056 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1263318112633181 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07759562841530054 - nodes in this community are weakly interconnected._