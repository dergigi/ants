# Nostr Search

A simple search interface for Nostr events.

## Search Examples

### Basic Search
- `vibe coding` - Find events containing "vibe coding"
- `#PenisButter` - Find events with specific hashtag
- `#YESTR` - Find events with specific hashtag
- `#SovEng` - Find events with specific hashtag

### Author Search
- `by:dergigi` - Find events from dergigi
- `by:gigi` - Find events from gigi
- `by:pablo` - Find events from pablo
- `by:corndalorian` - Find events from corndalorian

### Combined Search
- `GM by:dergigi` - Find "GM" messages from dergigi
- `#YESTR by:dergigi` - Find #YESTR events from gigi
- `👀 by:dergigi` - Find events with 👀 from gigi
- `.jpg by:corndalorian` - Find .jpg events from corndalorian

### Operators & Media
- `bitcoin OR lightning` - Match either
- `https://dergigi.com/vew` - Exact URL match
- `has:image` - Notes with any image (png, jpg, jpeg, gif, gifs, apng, webp, avif, svg)
- `is:image` - Notes that are just a single image
- `has:video` - Notes with any video (mp4, webm, ogg, ogv, mov, m4v)
- `is:video` - Notes that are just a single video
- `has:gif` - Notes with gif/gifs/apng
- `is:gif` - Notes that are just a single gif/apng
- `is:quote` - Notes that quote other nostr events
- `is:mention` - Notes that mention other nostr profiles

### Site-specific Search
- `site:yt` - Find posts with YouTube links
- `site:gh` - Find posts with GitHub links
- `site:twitter` or `site:x` - Find posts with Twitter/X links
- `site:reddit` - Find posts with Reddit links
- `site:yt,gh` - Find posts with YouTube OR GitHub links

### NIP-50 Extensions
- `include:spam` - Disable spam filtering
- `domain:example.com` - Only events from users with NIP-05 domain
- `language:en` - Filter by ISO 639-1 language code
- `sentiment:positive` - Filter by sentiment (negative/neutral/positive)
- `nsfw:false` - Exclude NSFW events

### Direct NPUB Search
- `npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc` - Find events by direct npub
- `GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc` - Find "GN" messages by direct npub

### Bech32 Identifiers
- `nevent1...` - Fetch specific event by nevent identifier
- `note1...` - Fetch specific event by note identifier

### Profile Lookup
- `p:fiatjaf` - Look up a profile (full-text search across name, display name, about)
- `@dergigi.com` - Resolve NIP-05
- `/p/npub1...` - Direct profile page URL

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

# Run tests
npm test
```

### Search substitutions

All search substitutions (site aliases, media type expansions, etc.) are loaded from [`replacements.txt`](public/replacements.txt). This file contains the mappings for `site:`, `is:`, and `has:` modifiers, making it easy to see what substitutions are currently available and add new ones.

## License

MIT License. See [LICENSE](LICENSE) for details.
