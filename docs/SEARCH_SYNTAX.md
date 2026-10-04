# Search syntax

This document describes the ANTLR web query language, version 1. The grammar and portable fixtures live in [grammar](../grammar/README.md). Android integration is a separate step; these rules do not yet describe the Android release.

## Start here

| Search | Meaning |
| --- | --- |
| `bitcoin` | Search event text through NIP-50 relays |
| `by:dergigi` | Resolve dergigi through the existing Vertex/profile resolver and search that author's events |
| `(bitcoin OR nostr) by:dergigi` | Either text query, restricted to that author |
| `by:(dergigi OR fiatjaf) kind:(1 OR 30023)` | Either author and either kind |
| `(by:dergigi kind:1) OR (by:fiatjaf kind:30023)` | Notes by dergigi or articles by fiatjaf, preserving the association |
| `p:"Alice Smith"` | Search profiles |
| `"(cats OR dogs)"` | Send the quoted phrase as text; parentheses and OR are literal |
| `since:2w (bitcoin OR lightning)` | Both alternatives use the same relative date boundary |

## Grouping and operators

Parentheses group expressions and may nest. `AND` binds more tightly than `OR`. Spaces between terms also mean conjunction, so `a b OR c` means `(a AND b) OR c`. Operators are case-insensitive whole tokens. Quote an operator to search for it literally.

Each conjunction becomes a branch; OR combines branches by union and event-ID deduplication. For text within a branch, ants sends the combined search string to a NIP-50 relay. The relay determines text matching and phrase support; ants does not promise a portable full-text Boolean engine inside a branch.

`NOT` is reserved and rejected in version 1. It is not silently treated as an exclusion filter. Use `"NOT"` for literal text.

A field followed by a group applies to its values: `by:(alice OR bob)` means `by:alice OR by:bob`. Groups inside a field cannot contain other field names. Use ordinary groups for combinations such as `(by:alice kind:1)`.

## Quotes and escaping

Double quotes preserve spaces, parentheses, operators, and modifier-looking text. `"kind:20"` searches for text; `kind:20` filters by event kind. Inside double quotes, `\"` represents a literal quote and `\\` represents a backslash. Other escape sequences and unclosed quotes are errors.

Field values can be quoted, for example `p:"Alice Smith"`. Quotes do not disable the meaning of a recognized field: `by:"alice"` still resolves an author. To search the entire modifier literally, write `"by:alice"`.

## Filters and aliases

| Syntax | Behavior |
| --- | --- |
| `by:value`, `from:value` | Author name, NIP-05, npub, or hex public key |
| `mentions:value` | Resolve a public key and filter the event's `p` tags |
| `by:@me`, `mentions:@me` | Current logged-in account |
| `by:@contacts`, `mentions:@contacts` | Current account's contact list |
| `kind:1`, `kind:1,30023` | One kind or a list of alternatives; integers 0–65535 |
| `#nostr` | Match the `t` tag, normalized to lowercase |
| `since:2026-01-01`, `until:2026-12-31` | Inclusive UTC date bounds |
| `since:12h`, `since:2w` | Relative date; units `h`, `d`, `w`, `m`, `y` |
| `p:alice`, `p:(alice OR bob)` | Profile search, including existing exact-key and NIP-05 resolution |
| `a:kind:pubkey:identifier` | Match an address tag |
| `license:MIT` | Match a license tag on relays supporting that filter |
| `is:article`, `is:video` | Kind aliases from `/kinds` and [replacements.txt](../public/replacements.txt) |
| `has:image`, `has:video`, `has:gif` | Alternative file-extension text searches from the alias table |
| `site:yt`, `site:(github OR youtube)` | Domain text searches, with registered aliases expanded |
| `nip:50` | Search the corresponding NIP repository path |
| `domain:example.com`, `language:en`, `sentiment:positive`, `nsfw:false`, `include:spam` | NIP-50 extensions passed to search relays; unsupported extensions may be ignored |

Use commas for alternatives within `kind:`, `by:`, `from:`, and `mentions:`. Use scoped OR for site aliases, such as `site:(yt OR gh)`.

Repeated author or kind filters in one conjunction mean intersection, not union. `kind:1,2 kind:2,3` means kind 2. Contradictory filters produce an error; use OR when you intend alternatives. Repeated `since:` selects the latest lower bound; repeated `until:` selects the earliest upper bound. An inverted date interval is rejected.

Version 1 rejects multiple distinct required hashtags in one branch and multiple `mentions:` clauses. Nostr tag arrays represent alternatives, not a requirement that all values be present. Use `#a OR #b` or `mentions:(alice OR bob)` for alternatives.

Absolute dates must exist in the calendar. Relative hours use the execution time; the other relative units use UTC calendar dates. For compatibility, relative months and years retain JavaScript overflow behavior: March 31 minus one month can land in early March. All branches in a search use one clock snapshot. Preview dates are illustrative and are recomputed when submitted.

Unknown modifiers and removed `relay:` / `relays:` modifiers produce errors. Select relays using the app controls. To search unknown colon-containing text, quote the complete token.

## URLs and identifiers

Unquoted HTTP, HTTPS, and FTP URLs are normalized to domain/path text searches. Quote a URL if it contains parentheses or you want its protocol preserved as literal text.

Standalone `note`, `nevent`, and `naddr` identifiers retain direct lookup and relay-hint behavior. `nostr:` prefixes are accepted. Standalone npub/nprofile identifiers retain navigation to their profile pages; the query backend can also compile standalone key branches into author filters.

Use `p:dergigi.com` for a profile lookup and `site:dergigi.com` for domain text. Bare domains are now ordinary search text, so a filename or website does not unexpectedly become an identity lookup.

## Preview and errors

The preview uses the same parser, aliases, and branch plan as execution. It resolves author and mention fields through the existing Vertex/profile resolver and displays their npubs, including values inside scoped groups. Literal quoted text is never resolved. In-flight identity lookups are shared with submission.

Errors include a character position. Positions use UTF-16 offsets, matching JavaScript and Java string indices. A malformed query is never executed with silently repaired syntax. An unresolved author causes an error rather than removing the author constraint.

## Resource limits

Queries allow up to 2,000 UTF-16 code units, 16 nested groups, and 256 syntax-tree nodes before alias expansion. After alias expansion and safe same-field compaction, a plan may contain at most 32 branches. The planner checks the branch product before allocating it.

The executor runs at most four branches concurrently, with an eight-second event-subscription timeout and a 30-second overall search deadline. Event subscriptions retain at most the requested result count, capped at 500 per branch. Results are checked against structured branch filters before being shown, merged by ID, sorted newest first, and limited for display. Specialized profile and identifier lookups retain their existing internal transport behavior.

## Changes from the previous web parser

- Branch-local kinds, dates, and author constraints keep their scope.
- Quotes consistently protect syntax; escaped quotes and backslashes are supported.
- Nesting and explicit AND use a grammar rather than string distribution.
- Adjacent distinct kind/author constraints intersect; alternatives require OR or a comma list.
- Unknown fields and removed relay modifiers fail visibly instead of disappearing.
- Profile lookup uses explicit `p:`; bare domains are text.
- Oversized plans and invalid dates are rejected.

The executable examples and [portable fixtures](../grammar/fixtures/queries.json) are checked in CI. The fixtures are intended to become the common web/Android contract.
