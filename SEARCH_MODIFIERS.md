## Search modifiers and behavior

This document catalogs the special query syntax supported by the search UI and engine, plus how to extend it.

### Boolean logic

- **OR operator**: Use literal ` OR ` (uppercase, with spaces) to combine sub-queries. Quoted phrases are respected when splitting.
  - Example: `cats OR "golden retriever"`

### Media filters

- **has:image(s)**: Content contains at least one image URL.
- **has:video(s)**: Content contains at least one video URL.
- **has:gif(s)**: Content contains at least one GIF/APNG URL.
- **is:image**: Content is exactly one image URL and nothing else.
- **is:video**: Content is exactly one video URL and nothing else.
- **is:gif**: Content is exactly one GIF/APNG URL and nothing else.

Notes:
- These modifiers are client-side filters. They are stripped from the NIP-50 full-text query and enforced after results are fetched.
- When a media modifier is present, the engine seeds search with relevant file extensions to improve recall.

### Site/domain filter (alias expansion)

- **site:<token>**: Restrict to content that links to one of the mapped hosts. Multiple tokens can be provided comma-separated, e.g. `site:yt,gh`.
- The token may be a known alias (e.g. `yt`) or a full domain (e.g. `nytimes.com`).
- Behavior:
  - Expands aliases to a list of hostnames (see mapping below)
  - Adds a client-side URL filter (no relay-side constraint)
  - Seeds the search with the expanded hostnames to improve recall

Current alias mappings (token → domains):

```text
youtube → youtube.com, youtu.be, m.youtube.com, www.youtube.com, youtube-nocookie.com
yt      → youtube.com, youtu.be, m.youtube.com, www.youtube.com, youtube-nocookie.com
reddit  → reddit.com, www.reddit.com, old.reddit.com, new.reddit.com, m.reddit.com, reddit.co
twitter → twitter.com, www.twitter.com, m.twitter.com, x.com, t.co
x       → twitter.com, www.twitter.com, m.twitter.com, x.com, t.co
wikipedia → wikipedia.org, en.wikipedia.org, www.wikipedia.org, m.wikipedia.org
wiki    → wikipedia.org, en.wikipedia.org, www.wikipedia.org, m.wikipedia.org
facebook → facebook.com, www.facebook.com, m.facebook.com, fb.com
fb      → facebook.com, www.facebook.com, m.facebook.com, fb.com
instagram → instagram.com, www.instagram.com, m.instagram.com
ig      → instagram.com, www.instagram.com, m.instagram.com
linkedin → linkedin.com, www.linkedin.com, m.linkedin.com, lnkd.in
pinterest → pinterest.com, www.pinterest.com, m.pinterest.com
tumblr  → tumblr.com, www.tumblr.com, m.tumblr.com
flickr  → flickr.com, www.flickr.com, m.flickr.com
github  → github.com, www.github.com, gist.github.com
gh      → github.com, www.github.com, gist.github.com
quora   → quora.com, www.quora.com, m.quora.com
```

Examples:
- `site:yt`: matches posts containing YouTube links.
- `site:yt,gh rust`: YouTube or GitHub links that also contain the word “rust”.

### Author filter

- **by:<author>**: Restrict to a specific author.
  - Accepts an `npub...` or a name/handle that resolves via the Vertex DVM (with fallbacks).
  - Example: `by:npub1... rust`, `by:jack bitcoin`

### Hashtags

- If the query contains only hashtags (e.g., `#nostr #bitcoin`), the engine uses tag-based filtering across a broader relay set.
- If hashtags are mixed with other text, they are treated as part of the full-text search.

### NIP-50 extensions (passed through to relays)

- **include:spam**: Disable spam filtering.
- **domain:<domain>**: Only events from users whose valid NIP-05 domain matches `<domain>`.
- **language:<xx>**: Filter by ISO 639-1 two-letter language code (e.g., `language:en`).
- **sentiment:<negative|neutral|positive>**: Filter by sentiment classification.
- **nsfw:<true|false>**: Include or exclude NSFW events.

These are appended to the `search` string sent to NIP-50 capable relays.

### URLs and identifiers

- **URL**: If the query is an `http(s)` URL, the engine performs an exact literal search for the URL.
- **nevent/note**: If the query is a bech32 `nevent` or `note`, the engine fetches that event by id.
- **npub**: If the query is an `npub...`, the engine fetches recent notes by that author.
- **NIP-05**: Queries that look like `name@domain.tld`, `@name@domain.tld`, or `domain.tld` are resolved; on success the author’s profile event is returned.

### Legacy/stripped modifiers

- **relay:<url>** and **relays:mine** are recognized and stripped (no-ops in current UI).

---

## Extending modifiers

Query modifiers are implemented as modular extensions:

- Registry: `src/lib/search/extensions/index.ts`
- Types: `src/lib/search/extensions/types.ts`
- Example extension: `src/lib/search/extensions/site.ts`
- Site alias map: `src/lib/search/extensions/site-hosts.ts`

To add a new modifier:
1. Create a new extension module that implements `QueryExtension`.
2. Add it to the `queryExtensions` array in `index.ts`.
3. If it only needs client-side filtering, return a `filters` function; if it benefits from recall, also return `seeds` to seed the relay search.


