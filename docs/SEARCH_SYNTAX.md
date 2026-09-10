# ants search syntax

A reference for using ants, and a working document for reviewing the language before building a mobile app.

**Status:** describes the implementation on `master` at [`ad60ead`](https://github.com/dergigi/ants/tree/ad60eadb87e37e550908e6e7d4b09393fd8ec18d) (v0.4.7), reviewed September 10, 2026. The design proposals below are open for discussion. They are not implemented promises. Keyword restoration is paused.

- [Start here](#start-here)
- [Operators](#operators)
- [Combining searches](#combining-searches)
- [Dates](#dates)
- [Kinds and media](#kinds-and-media)
- [People and profiles](#people-and-profiles)
- [Links, identifiers, and shared searches](#links-identifiers-and-shared-searches)
- [Advanced relay extensions](#advanced-relay-extensions)
- [Commands](#commands)
- [Current inconsistencies](#current-inconsistencies)
- [Decisions for a mobile-ready syntax](#decisions-for-a-mobile-ready-syntax)
- [Implementation sources](#implementation-sources)

## Start here

| I want to find… | Query |
| --- | --- |
| Posts mentioning a topic | `vibe coding` |
| Posts by someone | `by:dergigi` |
| A topic from one author | `bitcoin by:dergigi` |
| Either of two topics | `bitcoin OR lightning` |
| Either topic from one author | `(bitcoin OR lightning) by:dergigi` |
| Events tagged with a hashtag | `#asknostr` |
| Images linked in posts | `has:image` |
| Picture events | `is:image` |
| Highlights | `is:highlight` |
| Long-form articles | `is:article` |
| Profiles | `p:fiatjaf` |
| My own posts | `by:@me` (login required) |
| Events that tag me | `mentions:@me` (login required) |
| Recent mentions of a topic | `bitcoin since:2w` |
| Posts during a date range | `bitcoin since:2024-01-01 until:2024-03-31` |

Free text is sent to search-capable relays. Matching, phrase handling, stemming, relevance, and completeness depend on those relays. ants does not have one central index of all Nostr events.

Ordinary event searches default to kinds **1, 20, 21, 22, 9802, and 39089**: notes, pictures, videos, highlights, and follow packs. Specify `kind:` or `is:` to search other kinds. Profile and direct-identifier lookups have their own paths.

Event results are generally displayed newest first. Profile searches use profile ranking. A zero-result search is not proof that no matching event exists: relay availability, indexing, and timeouts affect the result.

## Operators

Use `keyword:value`, without a space after the colon. Prefer lowercase keywords; case handling is not uniform across every parser path. Values can have their own case-sensitive meaning.

| Syntax | Meaning | Important detail |
| --- | --- | --- |
| `by:person` | Events authored by a resolved person | Resolves to a public key; names can be ambiguous. |
| `mentions:person` | Events containing a `p` tag for that person | Structured tagging, not a text mention of the person's name. |
| `p:term` | Search profiles | Separate result type; not a general filter to combine with every event operator. |
| `#tag` | Search hashtag tags on the dedicated tag path | See composition limitations below. |
| `kind:number` | Select a numeric event kind | `kind:1,9802` selects either kind. |
| `is:name` | Human-readable alias for event kinds | For example, `is:article` → `kind:30023`. |
| `has:image`, `has:gif`, `has:video` | Search for media filename extensions in content | Heuristic text searches; no media inspection. |
| `site:domain` | Search for a domain string | Known aliases expand to alternative strings. Not a strict URL-host filter. |
| `nip:05` | Search for links containing `nips/blob/master/05.md` | A text substitution, not a claim about an event's protocol compliance. |
| `since:date` | Lower time bound | UTC; see [Dates](#dates). |
| `until:date` | Upper time bound | Absolute dates include the entire UTC day. |
| `license:MIT` | Select the `license` tag | Specialized license-only path, with optional kinds/dates. Values are uppercased. |
| `a:kind:pubkey:identifier` | Select an `a` reference tag | Specialized path; finds referencing events, not the addressed event itself. |

For repeated alternatives, explicit `OR` is usually clearer than repeating an operator. Do not assume every repeated operator has the same meaning. For example, multiple hashtag values on the pure hashtag path match **any** listed tag, while the simple author path extracts only the first `by:` token.

## Combining searches

Examples supported by the current search flows:

```text
bitcoin by:dergigi
bitcoin OR lightning
(GM OR GN) by:dergigi
NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)
is:highlight (bitcoin OR nostr)
p:(NewsBot OR RSS)
```

`OR` is case-insensitive. Parenthesized alternatives are expanded into separate searches, and results are combined and deduplicated. Surrounding terms can be distributed across those alternatives. More alternatives can therefore mean more relay requests; two independent groups can multiply the number of searches.

Spaces combine text with structured filters in supported paths. They do **not** establish a universal, client-enforced Boolean `AND` between every word. For example, the author filter in `bitcoin by:dergigi` is structured, but the relay decides how to match the text `bitcoin`.

Double quotes express a phrase request, for example `"proof of work"`. Phrase semantics remain relay-dependent, and quoted operator-like text is not reliably protected from all preprocessing. `AND`, `NOT`, leading-minus exclusions, wildcard matching, escaping, and arbitrary Boolean precedence are **not a defined ants language contract**.

Kinds and dates are currently extracted before Boolean branches are executed. Avoid queries that require different kind/date constraints in different branches until scoping is defined and implemented. See the concrete examples under [Current inconsistencies](#current-inconsistencies).

## Dates

| Form | Example | Current interpretation |
| --- | --- | --- |
| Absolute lower bound | `since:2024-01-01` | January 1 at 00:00:00 UTC, inclusive. |
| Absolute upper bound | `until:2024-03-31` | March 31 at 23:59:59 UTC, inclusive. |
| Hours ago | `since:12h` | An exact timestamp 12 hours before evaluation. |
| Days ago | `since:3d` | Start of the UTC day three days ago. |
| Weeks ago | `since:2w` | Start of the UTC day 14 days ago. |
| Months ago | `since:1m` | UTC calendar subtraction, with JavaScript date overflow behavior. |
| Years ago | `since:1y` | UTC calendar subtraction, including leap-day overflow behavior. |

The same relative units work with `until:`. For `d`, `w`, `m`, and `y`, `until:` uses the end of the resulting UTC day. `m` means **months**, not minutes. Relative values are nonnegative whole numbers followed by `h`, `d`, `w`, `m`, or `y`.

Examples:

```text
bitcoin since:2w
nostr until:3d
GM by:dergigi since:12h
```

Relative dates move when the query is evaluated again. A saved query containing `since:2w` means a rolling period, not the original date range.

Validation is incomplete: an impossible date such as `2026-02-31` currently normalizes into March. Subtracting one month from March 31, 2026 also lands on March 3 rather than February 28. These are implementation behaviors to fix or explicitly decide, not desirable syntax guarantees. Arbitrary ISO timestamps and raw Unix timestamps are not accepted date forms in this parser.

## Kinds and media

`is:` selects what an event **is**. `has:` searches for strings suggesting what its content **contains**.

```text
is:image             Picture events (kind 20)
has:image            Content matching supported image extensions
is:video             Video events (kinds 21 or 22)
has:video            Content matching supported video extensions
is:highlight         Highlights (kind 9802)
```

Current media expansions:

| Modifier | Extensions searched |
| --- | --- |
| `has:image` | `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.svg` |
| `has:gif` | `.gif`, `.gifs`, `.apng` |
| `has:video` | `.mp4`, `.webm`, `.ogg`, `.ogv`, `.mov`, `.m4v` |

In particular, **`has:image` currently excludes GIF/APNG**. There is no `has:audio` alias on the referenced `master`. Inline playback support and search syntax are separate capabilities.

Current kind aliases:

| Alias | Kind(s) |
| --- | --- |
| `is:profile` | 0 |
| `is:tweet` | 1 |
| `is:repost` | 6 |
| `is:reaction` | 7 |
| `is:image`, `is:picture` | 20 |
| `is:video` | 21, 22 |
| `is:media` | 20, 21, 22 |
| `is:file` | 1063 |
| `is:code` | 1337 |
| `is:patch` | 1617 |
| `is:issue` | 1621 |
| `is:report` | 1984 |
| `is:nutzap` | 9321 |
| `is:zap` | 9735 |
| `is:highlight` | 9802 |
| `is:muted` | 10000 |
| `is:pin` | 10001 |
| `is:bookmark` | 10003 |
| `is:article`, `is:blogpost`, `is:longform` | 30023 |
| `is:followpack` | 39089 |

Rendering support varies by kind; an event may appear as raw JSON. `is:muted` searches mute-list events, not “all events from muted people.”

The [replacement file](../public/replacements.txt) is the authoritative list of aliases for a given revision. `/kinds` shows the current kind mappings in the app.

## People and profiles

Use `by:` for someone's events, `mentions:` for events tagging them, and `p:` to find profiles.

People can be identified using an `npub`, a hexadecimal public key where supported, a NIP-05 identifier such as `name@example.com`, or a name resolved through profile search. NIP-05 root identifiers such as `@dergigi.com` are supported in author resolution. Name results depend on available profile data and ranking; an `npub` is preferable when the identity must be unambiguous.

Login enables `@me` in `by:` and `mentions:`. It also affects profile resolution/ranking. The web client currently offers NIP-07 login; a mobile app will need its own authentication flow with the same meaning for “me.”

`p:zaps.lol` is a profile-domain search: it tries to narrow candidates to that NIP-05 domain, with fallback behavior. It is not equivalent to selecting the root identity `@zaps.lol`.

Profile pages implicitly scope searches to the displayed profile. A mobile filter UI should show that scope explicitly so users understand why results differ from a root-page search.

## Links, identifiers, and shared searches

Known site aliases include `site:yt`, `site:gh`, `site:hn`, `site:x`, and `site:wiki`. Comma lists such as `site:gh,yt` expand to alternatives. These are text substitutions, so a domain string can match outside an actual link. HTTP/HTTPS prefixes are stripped by general replacement rules; URL search is not exact URL identity matching.

A complete `note`, `nevent`, or `naddr` identifier can be used for a direct event lookup. A complete `npub` or `nprofile` entered in the web search box navigates to a profile. Bare domains can trigger NIP-05 resolution rather than ordinary text search. Use `site:` when domain-string search is intended.

| Web path | Purpose |
| --- | --- |
| `/?q=…` | Shared search; URL-encode the query. |
| `/p/<identifier>` | Profile lookup/view, with optional `?q=…` for a scoped search. |
| `/e/<identifier>` | Event lookup, including supported `naddr` identifiers. |
| `/t/<hashtags>` | Hashtag search; commas, plus signs, and spaces separate tags. |

Use standard URL encoding rather than assembling query strings by hand. For example:

[`(GM OR GN) by:dergigi`](https://ants.sh/?q=%28GM%20OR%20GN%29%20by%3Adergigi)

The current web routes do not define a mobile deep-link scheme. Root paths such as `/npub1…` and a separate `/a/` route remain open feature requests.

## Advanced relay extensions

The parser recognizes these extensions and appends them to nonempty text searches:

| Extension | Values |
| --- | --- |
| `include:spam` | Request inclusion of spam. |
| `domain:example.com` | Request a NIP-05-domain constraint. |
| `language:en` | Two-letter language code. |
| `sentiment:positive` | `negative`, `neutral`, or `positive`. |
| `nsfw:false` | `true` or `false`. |

These are relay-dependent requests, not guaranteed client-side filtering. An extension alone does not create a text search. Recognition by ants does not mean a relay implements it.

## Commands

`/help`, `/examples`, `/kinds`, `/login`, `/logout`, `/clear`, and `/tutorial` are web-app commands. `/clear` clears caches. Commands are UI actions and should be treated separately from the portable query language.

## Current inconsistencies

These findings come from source inspection and focused parser probes. They are not claims that every query has been tested against live relays.

| Area | Current behavior | Why it needs a decision or fix |
| --- | --- | --- |
| Author + mentions | The early author strategy can consume `mentions:bob by:alice` before the mentions strategy runs, treating `mentions:bob` as text. | An apparently valid combination can have different semantics from the individual filters. |
| Hashtags + authors/text | Pure hashtag queries use `#t`; the simple author path can send the hashtag as free text. Pure tag parsing recognizes ASCII letters, digits, and `_`. | `#tag` should have predictable meaning across combinations and languages. |
| Branch-local kinds | `kind:1 by:alice OR kind:30023 by:bob` extracts `[1,30023]` globally before splitting authors. | It does not reliably mean “Alice's notes or Bob's articles.” |
| Repeated dates | `since:2024-01-01 bitcoin OR since:2025-01-01 nostr` leaves the last `since:` value as a global bound. | Date scope is not local to each branch. |
| Quoted text | Some token extraction and substitutions still operate inside quotes. | Literal examples of query syntax can accidentally act as filters. |
| Parentheses | Expansion, replacements, and OR splitting happen in several passes. | This is not one consistent expression grammar; arbitrary nesting needs a defined contract and tests. |
| Unsupported operators | Unknown tokens can become search text. `relay:…` and `relays:mine` are explicitly stripped. | Users can believe a filter was applied when it was not. |
| Restored keywords | `id:`, `reply:`, `ref:`, `link:`, `d:`, and `@contacts` are not implemented on this baseline. Restoration is paused. | Decide whether these belong in the language before introducing them. |
| Media categories | `has:image` excludes GIF/APNG; extension searches can produce false positives. | Everyday words should have unsurprising category boundaries. |
| Date validation | Invalid dates normalize, and month/year subtraction can overflow. | Saved searches need predictable time semantics. |

## Decisions for a mobile-ready syntax

The following are **proposals for review**, not changes made by this document.

1. **Agree on the smallest useful language.** Keep the common concepts—text, people, mentions, kinds, media, dates, and alternatives—easy to learn. Evaluate additional reference/tag keywords individually. There is no assumption that the paused keywords should return.
2. **Define composition once.** A filter should mean the same thing alone, beside another filter, or inside parentheses. Decide operator precedence, branch scope, repeated-filter behavior, and what whitespace means.
3. **Make literals and errors unambiguous.** Decide quote/escape rules and whether unknown or incomplete operators should show a suggestion, an error, or an explicit text-search fallback. Never silently suggest that an ignored filter was applied.
4. **Choose user-facing names and categories.** Review `by:` versus `from:`, `p:` versus `profile:`, and `is:tweet` versus `is:note`. Decide whether aliases are conveniences or permanent compatibility commitments. Decide whether images include animations.
5. **Define time semantics.** Choose rolling durations versus calendar boundaries, UTC versus a user-selected zone, valid dates, month-end behavior, and how saved relative queries are evaluated.
6. **Separate typed text, resolved identities, and execution.** Preserve what the user typed, but represent resolved public keys and filters structurally. Show the resolved person before an ambiguous name materially changes the search.
7. **Give mobile controls and typed queries the same meaning.** Author pickers, date controls, and filter chips should edit the same parsed representation used by the text field. Avoid a second mobile-only interpretation of the language.
8. **Define sharing and compatibility.** Decide which text form is canonical, how profile scope is serialized, and when a syntax version becomes necessary. Existing web links should keep their intended meaning in the mobile app.
9. **State result guarantees honestly.** Explain partial results, unavailable relays, unsupported relay extensions, sorting, and the difference between no matches and a failed search.
10. **Bound query cost.** Decide limits for query length, OR expansion, relay fan-out, accumulated results, and overall search duration. Mobile cancellation should release work promptly. Numerical budgets still need measurement and agreement.

Before declaring the language stable, maintain a shared set of examples containing input text, expected parsed meaning, expected relay filters, and expected errors. Run those cases against both web and mobile implementations. Include every documented combination, not just isolated operators.

Suggested first review: settle composition and error behavior, then naming and media categories. Those decisions have more effect on intuitiveness than adding more keywords.

## Implementation sources

- [Search entry point and dispatch order](../src/lib/search.ts)
- [Kind/date/extension parsing](../src/lib/search/queryParsing.ts)
- [OR expansion and splitting](../src/lib/search/queryTransforms.ts) and [execution](../src/lib/search/orQueryHandler.ts)
- [Alias definitions](../public/replacements.txt) and [replacement logic](../src/lib/search/replacements.ts)
- [Relative-date behavior](../src/lib/search/relativeDates.ts)
- [Author and mention preprocessing](../src/lib/search/queryPreprocessing.ts)
- [Specialized search strategies](../src/lib/search/strategies)
- [Default search kinds](../src/lib/constants.ts)
- [Web commands](../src/lib/slashCommands.ts)
- [Existing example queries](../src/lib/examples.ts) and [browser smoke tests](../e2e/search-smoke.spec.ts)

When behavior changes, update this reference and the matching examples together. The README and `/help` should point readers here for the detailed language reference.
