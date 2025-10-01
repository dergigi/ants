# ants - advanced nostr text search

A simple search interface for Nostr events.

## Search Examples

### Basic Search

- [`vibe coding`](https://search.dergigi.com/?q=vibe%20coding) - Find events containing "vibe coding"
- [`nicolas-cage.gif`](https://search.dergigi.com/?q=nicolas-cage.gif) - Find events containing "nicolas-cage.gif"
- [`#PenisButter`](https://search.dergigi.com/?q=%23PenisButter) - Find events with specific hashtag
- [`#YESTR`](https://search.dergigi.com/?q=%23YESTR) - Find events with specific hashtag
- [`#SovEng`](https://search.dergigi.com/?q=%23SovEng) - Find events with specific hashtag

### Author Search

- [`by:dergigi`](https://search.dergigi.com/?q=by%3Adergigi) - Find events from dergigi
- [`by:gigi`](https://search.dergigi.com/?q=by%3Agigi) - Find events from gigi
- [`by:pablo`](https://search.dergigi.com/?q=by%3Apablo) - Find events from pablo
- [`by:corndalorian`](https://search.dergigi.com/?q=by%3Acorndalorian) - Find events from corndalorian

### Combined Search

- [`GM by:dergigi`](https://search.dergigi.com/?q=GM%20by%3Adergigi) - Find "GM" messages from dergigi
- [`#YESTR by:dergigi`](https://search.dergigi.com/?q=%23YESTR%20by%3Adergigi) - Find #YESTR events from gigi
- [`👀 by:dergigi`](https://search.dergigi.com/?q=%F0%9F%91%80%20by%3Adergigi) - Find events with 👀 from gigi
- [`.jpg by:corndalorian`](https://search.dergigi.com/?q=.jpg%20by%3Acorndalorian) - Find .jpg events from corndalorian
- [`GM fiat by:fiatjaf`](https://search.dergigi.com/?q=GM%20fiat%20by%3Afiatjaf) - Find posts containing "GM fiat" from fiatjaf
- [`site:github by:fiatjaf`](https://search.dergigi.com/?q=site%3Agithub%20by%3Afiatjaf) - GitHub links from fiatjaf
- [`by:dergigi site:yt`](https://search.dergigi.com/?q=by%3Adergigi%20site%3Ayt) - YouTube links from dergigi
- [`#news site:rumble.com`](https://search.dergigi.com/?q=%23news%20site%3Arumble.com) - #news posts linking to rumble.com

### Operators & Media

- [`bitcoin OR lightning`](https://search.dergigi.com/?q=bitcoin%20OR%20lightning) - Match either
- [`https://dergigi.com/vew`](https://search.dergigi.com/?q=https%3A//dergigi.com/vew) - Exact URL match
- [`has:image`](https://search.dergigi.com/?q=has%3Aimage) - Notes with any image (png, jpg, jpeg, gif, gifs, apng, webp, avif, svg)
- [`is:image`](https://search.dergigi.com/?q=is%3Aimage) - Notes that are just a single image
- [`has:image OR is:image`](https://search.dergigi.com/?q=has%3Aimage%20OR%20is%3Aimage) - Notes with any image OR notes that are just a single image
- [`has:video`](https://search.dergigi.com/?q=has%3Avideo) - Notes with any video (mp4, webm, ogg, ogv, mov, m4v)
- [`is:video`](https://search.dergigi.com/?q=is%3Avideo) - Notes that are just a single video
- [`has:gif`](https://search.dergigi.com/?q=has%3Agif) - Notes with gif/gifs/apng
- [`(GM OR GN) by:dergigi has:image`](https://search.dergigi.com/?q=%28GM%20OR%20GN%29%20by%3Adergigi%20has%3Aimage) - Boolean OR plus media filter scoped to author

### Site-specific Search

- [`site:yt`](https://search.dergigi.com/?q=site%3Ayt) - Find posts with YouTube links
- [`site:gh`](https://search.dergigi.com/?q=site%3Agh) - Find posts with GitHub links
- [`site:twitter`](https://search.dergigi.com/?q=site%3Atwitter) or [`site:x`](https://search.dergigi.com/?q=site%3Ax) - Find posts with Twitter/X links
- [`site:reddit`](https://search.dergigi.com/?q=site%3Areddit) - Find posts with Reddit links
- [`site:yt,gh`](https://search.dergigi.com/?q=site%3Ayt%2Cgh) - Find posts with YouTube OR GitHub links

### NIP-50 Extensions

- [`include:spam`](https://search.dergigi.com/?q=include%3Aspam) - Disable spam filtering
- [`domain:example.com`](https://search.dergigi.com/?q=domain%3Aexample.com) - Only events from users with NIP-05 domain
- [`language:en`](https://search.dergigi.com/?q=language%3Aen) - Filter by ISO 639-1 language code
- [`sentiment:positive`](https://search.dergigi.com/?q=sentiment%3Apositive) - Filter by sentiment (negative/neutral/positive)
- [`nsfw:false`](https://search.dergigi.com/?q=nsfw%3Afalse) - Hide NSFW content
- [`nsfw:true`](https://search.dergigi.com/?q=nsfw%3Atrue) - Include NSFW content

### Kinds Filter

- [`is:muted by:fiatjaf`](https://search.dergigi.com/?q=is%3Amuted%20by%3Afiatjaf) - Muted lists by fiatjaf
- [`is:zap by:marty`](https://search.dergigi.com/?q=is%3Azap%20by%3Amarty) - Zaps by marty
- [`is:bookmark by:hzrd`](https://search.dergigi.com/?q=is%3Abookmark%20by%3Ahzrd) - Bookmarks by hzrd
- [`is:file`](https://search.dergigi.com/?q=is%3Afile) - File notes
- [`is:repost by:dor`](https://search.dergigi.com/?q=is%3Arepost%20by%3Ador) - Reposts by dor
- [`is:muted by:carvalho`](https://search.dergigi.com/?q=is%3Amuted%20by%3Acarvalho) - Muted lists by carvalho
- [`is:highlight`](https://search.dergigi.com/?q=is%3Ahighlight) - Highlights
- [`is:blogpost`](https://search.dergigi.com/?q=is%3Ablogpost) - Articles

### Multiple Authors

- [`NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)`](https://search.dergigi.com/?q=NIP-EE%20%28by%3Ajeffg%20OR%20by%3Afuturepaul%20OR%20by%3Afranzap%29) - Search across multiple authors

### Direct NPUB Search

- [`npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc`](https://search.dergigi.com/?q=npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc) - Find events by direct npub
- [`GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc`](https://search.dergigi.com/?q=GN%20by%3Anpub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc) - Find "GN" messages by direct npub

### Bech32 Identifiers

- [`nevent1...`](https://search.dergigi.com/?q=nevent1...) - Fetch specific event by nevent identifier
- [`note1...`](https://search.dergigi.com/?q=note1...) - Fetch specific event by note identifier

### Profile Lookup

- [`p:fiatjaf`](https://search.dergigi.com/?q=p%3Afiatjaf) - Look up a profile (full-text search across name, display name, about)
- [`@dergigi.com`](https://search.dergigi.com/?q=%40dergigi.com) - Resolve NIP-05
- [`/p/npub1...`](https://search.dergigi.com/?q=/p/npub1...) - Direct profile page URL

## URL Paths

The application supports several direct URL paths for quick access:

### Profile Pages

- `/p/[id]` - View a specific profile and their latest notes
  - `/p/npub1...` - Direct profile by npub
  - `/p/@username.com` - Profile by NIP-05 identifier
  - `/p/username` - Profile search by username

### Event Pages

- `/e/[id]` - View a specific event
  - `/e/nevent1...` - Event by nevent identifier
  - `/e/note1...` - Event by note identifier
  - `/e/[hex-id]` - Event by 64-character hex ID

### Hashtag Pages

- `/t/[hashtags]` - Search multiple hashtags
  - `/t/pugstr` - Search for #pugstr
  - `/t/pugstr,dogstr,goatstr` - Search for #pugstr OR #dogstr OR #goatstr
  - `/t/pugstr+dogstr+goatstr` - Alternative syntax for multiple hashtags
  - `/t/pugstr dogstr goatstr` - Space-separated hashtags

## Features

- Search for nostr posts (kind 1)
- Profile lookups via vertex.im (e.g. `p:fiatjaf`)
- Full-text profile search across names and bios
- Profile pages with latest notes (`/p/npub1...`)
- Random search examples for inspiration
- Clean, minimal interface
- Fast search results
- NIP-50 search extensions support
- Site-specific search with aliases
- Media type filtering (images, videos, gifs)
- Boolean OR operator support
- URL and bech32 identifier resolution

## Relay logic

- Hardcoded relay sets for default use and NIP-50 search are augmented on login via NIP-51:
  - kind:10002 user relays (general connections)
  - kind:10006 blocked relays (excluded)
  - kind:10007 search relays (added to search set)
- Relay capabilities are read via NIP-11 (`supported_nips`) and shown in the relay status indicator.
- The relay status indicator highlights relays that returned current results (shown in blue), marks NIP-50 relays with a magnifying glass, and lets you filter results by relay.

## Search logic

Two query types:

- Search queries (NIP-50):
  - Connect only to NIP-50-capable relays
  - Run one search per OR-clause/expanded query
- Direct queries (NIP-19 bech32: `npub`, `note`, `nprofile`, `nevent`, `naddr`):
  - Connect to the broader relay set
  - Fetch the entity directly (no NIP-50 required)

Examples:

- `is:highlight by:fiatjaf OR #YESTR by:dergigi.com` → resolves to two direct filters: `kind:9802 by:<npub(hex)>` and `t:yestr by:<npub(hex)>` (no full-text search).
- `has:video by:HODL` → `has:video` expands to file extensions, requiring NIP-50 full-text search.

## Profile lookups and Vertex

- `by:` and `p:` try best-effort profile resolution.
- Logged in: use Vertex DVM with `personalizedPagerank`. Logged out/unavailable: NIP-50 fallback with heuristic ranking.
- Results are cached by search string and login state.
- NIP-05 identifiers are resolved directly to hex without hitting search relays when valid. Plaintext usernames (e.g., `fiatjaf`) are queried via NIP-50 (`kind:0 <term>`).

References: [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md), [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md), [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md), [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md), [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md), [Vertex algos](https://vertexlab.io/docs/algos/).

## Live Instances

- [search.dergigi.com](https://search.dergigi.com/)

## Ranking behavior

- When logged in and Vertex credits are available, profile lookups and author resolution use **personalizedPagerank** (your pubkey is sent as `source`).
- When logged out or Vertex is unavailable, relay-based ranking is used (see fallback below).

This applies when resolving usernames like `by:john` or direct profile lookups like `p:john`. See the Vertex docs for details on parameters and response format: [`https://vertexlab.io/docs/services/search-profiles/`](https://vertexlab.io/docs/services/search-profiles/).

Note that proper username resolution requires Vertex credits. See [Vertex pricing](https://vertexlab.io/pricing/) for details on credit costs and tiers.

### Fallback ranking

If Vertex is unavailable or credits are insufficient (or when logged out), we fall back to a relay search for `kind:0` profiles matching the username and rank candidates as follows:

- Logged in: prioritize profiles that you directly follow; tiebreak by prefix match and name.
- Not logged in: sort by the number of follower references (count of `kind:3` contacts that include the candidate pubkey), then prefix match and name.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

### Configuration

Set the public site URL (used for Open Graph/Twitter metadata) via environment variable:

```bash
NEXT_PUBLIC_SITE_URL=https://search.dergigi.com
```

You can place this in a local `.env` file.

### Search substitutions

All search substitutions (site aliases, media type expansions, etc.) are loaded from [`replacements.txt`](public/replacements.txt). This file contains the mappings for `site:`, `is:`, and `has:` modifiers, making it easy to see what substitutions are currently available and add new ones.

## License

MIT License. See [LICENSE](LICENSE) for details.
