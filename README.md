# ants - advanced nostr text search

A simple search interface for Nostr events.

## Search Examples

### Basic Search
- [`vibe coding`](https://search.dergigi.com/?q=vibe%20coding) - Find events containing "vibe coding"
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

### Operators & Media
- [`bitcoin OR lightning`](https://search.dergigi.com/?q=bitcoin%20OR%20lightning) - Match either
- [`https://dergigi.com/vew`](https://search.dergigi.com/?q=https%3A//dergigi.com/vew) - Exact URL match
- [`has:image`](https://search.dergigi.com/?q=has%3Aimage) - Notes with any image (png, jpg, jpeg, gif, gifs, apng, webp, avif, svg)
- [`is:image`](https://search.dergigi.com/?q=is%3Aimage) - Notes that are just a single image
- [`has:video`](https://search.dergigi.com/?q=has%3Avideo) - Notes with any video (mp4, webm, ogg, ogv, mov, m4v)
- [`is:video`](https://search.dergigi.com/?q=is%3Avideo) - Notes that are just a single video
- [`has:gif`](https://search.dergigi.com/?q=has%3Agif) - Notes with gif/gifs/apng
- [`is:gif`](https://search.dergigi.com/?q=is%3Agif) - Notes that are just a single gif/apng
- [`is:quote`](https://search.dergigi.com/?q=is%3Aquote) - Notes that quote other nostr events
- [`is:mention`](https://search.dergigi.com/?q=is%3Amention) - Notes that mention other nostr profiles

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

## Live Instances

- https://search.dergigi.com/

## Ranking behavior

- When you are logged in, profile lookups and author resolution use **personalizedPagerank** from your point of view (your pubkey is sent as `source`).
- When you are not logged in, the app falls back to **globalPagerank**.

This applies when resolving usernames like `by:john` or direct profile lookups like `p:john`. See the Vertex docs for details on parameters and response format: [`https://vertexlab.io/docs/services/search-profiles/`](https://vertexlab.io/docs/services/search-profiles/).

Note that proper username resolution requires Vertex credits. See [Vertex pricing](https://vertexlab.io/pricing/) for details on credit costs and tiers.

### Vertex credit fallback

If the Vertex DVM responds with an "insufficient credits" status, we fall back to a relay search for `kind:0` profiles matching the username and rank candidates as follows:

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
