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
