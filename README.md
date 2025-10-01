# ants - advanced nostr text search

An advanced search interface for Nostr.

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
- NIP-50 search extensions support
- Site-specific search with aliases
- Media type filtering (images, videos, gifs)
- Boolean OR operator support
- URL and bech32 identifier resolution

# Relay Logic

There is hardcoded relays for search (NIP-50) as well as for general use.

Upon login, we retrieve the user's relays as per NIP-51 (kind:10002) and remove any blocked relays (kind:10006). We also retrieve the user's search relays (kind:10007) and use them for search queries in addition it to the hardcoded list of search relays.

When connecting to a relay we retrieve the `supported_nips` as per NIP-11. The relay list as well as the supported NIPs are shown in the relay status indicator. Relays that returned one or more of the results that are currently shown on the page are shown in blue. Relays that support NIP-50 show a magnifying glass. The relay icon in the relay status display allows for relay-based client-side filtering of results.

# Search Logic

We have two kinds of queries:
- Search queries (NIP-50)
- Direct queries (bech32-encoded entities as per NIP-19, i.e. `npub`, `note`, `nprofile`, `nevent`, `naddr`)

Search queries:
- Connect to NIP-50 relays exclusively
- Do a NIP-50 search for each resulting query we have
- (we might need to do multiple queries if the user does an `OR` search)

Direct queries:
- Connect to all relays
- Retrieve the bech32-encoded entity directly
- (No need for a NIP-50 search)

A lot of complex queries are still direct queries, e.g. `is:highlight by:fiatjaf OR #YESTR by:dergigi.com` will resolve to two queries, namely:

1. `kind:9802 by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc`
2. `#YESTR by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc`

None of these need search. (1) is simply `kind:9802` with `authors: [6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93]` and (2) is simply `t:yestr` with Gigi's npub converted to hex.

However, if we have something like `has:video by:HODL` we will have to hit NIP-50 relays, because `has:video` expands to `.mp4 OR .webm OR .mov ...` and thus we'll have to do a full-text search.

# Profile Lookups and Vertex Logic

When resolving a `by:` or `p:` search, we try to do a best-effort profile lookup. If the user is logged in we use the Vertex DVM to do the profile lookup, using `personalizedPagerank`.

In short:

```
if logged_in:
	profile = get_profile_from_vertex("search string")
else:
	profile = get_profile_from_fallback("search string")

cache_result("search string", logged_in_status, profile)
```

The fallback is a NIP-50 search that attempts to do a "smart" ranking of profile results to figure out the most real (most relevant) profile. But it might be wrong. For reliable results users should login and use Vertex.

Profile searches might be a plaintext search like `gigi` or `dergigi`, npubs like `npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc` or NIP-05 identifiers like `me@dergigi.com`, or top-level NIP-05 identifiers like `dergigi.com` (which is equivalent to `@dergigi.com` or `_@dergigi.com`).

If it's a valid NIP-05 we should be able to get the hex of the npub straight up, without having to hit a search relay. If it's a plaintext search like `fiatjaf` we basically do a `kind:0 fiatjaf`, i.e. a NIP-50 search for profile events (hitting NIP-50 relays exclusively).

NIP-05: https://github.com/nostr-protocol/nips/blob/master/05.md
NIP-11: https://github.com/nostr-protocol/nips/blob/master/11.md
NIP-19: https://github.com/nostr-protocol/nips/blob/master/19.md
NIP-50: https://github.com/nostr-protocol/nips/blob/master/50.md
NIP-51: https://github.com/nostr-protocol/nips/blob/master/51.md
Vertex: https://vertexlab.io/docs/algos/

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
