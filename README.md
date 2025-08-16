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
- `#YESTR by:gigi` - Find #YESTR events from gigi
- `👀 by:gigi` - Find events with 👀 from gigi
- `.jpg by:corndalorian` - Find .jpg events from corndalorian

### Direct NPUB Search
- `npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc` - Find events by direct npub
- `GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc` - Find "GN" messages by direct npub

### Profile Lookup
- `p:fiatjaf` - Look up a profile

## Features

- Search for nostr posts (kind 1)
- Profile lookups via vertex.im (e.g. `p:fiatjaf`)
- Random search examples for inspiration
- Clean, minimal interface
- Fast search results

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

## License

MIT License. See [LICENSE](LICENSE) for details.
