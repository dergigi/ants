# ants - advanced nostr text search

An advanced search interface for Nostr.

## Search Examples


- [`vibe coding`](https://search.dergigi.com/?q=vibe%20coding) - anything that mentions "vibe coding"
- [`by:fiatjaf`](https://search.dergigi.com/?q=by%3Afiatjaf) - find events from fiatjaf
- [`GM by:dergigi`](https://search.dergigi.com/?q=GM%20by%3Adergigi) - find "GM" messages from dergigi
- [`GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc`](https://search.dergigi.com/?q=GN%20by%3Anpub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc) - find "GN" messages by direct npub
- [`p:fiatjaf`](https://search.dergigi.com/?q=p%3Afiatjaf) - look up a profile (full-text search across name, display name, about)
- [`nip:05`](https://search.dergigi.com/?q=nip%3A05) - find notes that link to the NIP-05 spec
- [`bitcoin OR lightning`](https://search.dergigi.com/?q=bitcoin%20OR%20lightning) - match either
- [`(GM OR GN) by:dergigi has:image`](https://search.dergigi.com/?q=%28GM%20OR%20GN%29%20by%3Adergigi%20has%3Aimage) - boolean OR plus media filter scoped to author
- [`has:image`](https://search.dergigi.com/?q=has%3Aimage) - notes with any image (png, jpg, jpeg, gif, gifs, apng, webp, avif, svg)
- [`by:dergigi has:image`](https://search.dergigi.com/?q=by%3Adergigi%20has%3Aimage) - find images from dergigi
- [`site:yt`](https://search.dergigi.com/?q=site%3Ayt) - find posts with YouTube links
- [`is:highlight`](https://search.dergigi.com/?q=is%3Ahighlight) - highlights
- [`NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)`](https://search.dergigi.com/?q=NIP-EE%20%28by%3Ajeffg%20OR%20by%3Afuturepaul%20OR%20by%3Afranzap%29) - search across multiple authors
- [`#pugstr or #horsestr or #goatstr`](https://search.dergigi.com/?q=%23pugstr%20or%20%23horsestr%20or%20%23goatstr) - search for multiple hashtags
- [`is:highlight (by:fiatjaf.com OR by:@f7z.io)`](https://search.dergigi.com/?q=is%3Ahighlight%20%28by%3Afiatjaf.com%20OR%20by%3A%40f7z.io%29) - highlights from specific authors
- [`/help`](https://search.dergigi.com/?q=%2Fhelp) ...in case you're lost.

Type [`/examples`](https://search.dergigi.com/?q=%2Fexamples) in the search field to see the full list.

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
