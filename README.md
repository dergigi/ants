# ants - advanced nostr text search

An opinionated search interface for nostr.

ants is the search and discovery interface I always wanted to have. It can do reverse image lookups, has all kinds of search modifiers, and will not shy away from throwing events back at you that it can't even render yet.

The basic philosophy is to *always stay in search* and to embrace false positives, i.e. rather show too much than too little. But we still want to be able to filter out nonsense and spam. It's very much a work-in-progress. It doesn't have many [WoT](https://search.dergigi.com/?q=%28WoT+OR+%22web+of+trust%22%29+by%3Adergigi.com) features yet, for example.

The current version is not very performant and will probably crash often.

But it's useful to at least one person already, which is [me](https://search.dergigi.com/p/npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc).

## Search Examples

ants can search for [all kinds of stuff](https://search.dergigi.com/?q=%2Fexamples) by making good use of [NIP-05](https://search.dergigi.com/?q=nip%3A05), [NIP-50](https://search.dergigi.com/?q=nip%3A50), and having human-readable shorthands for (pun intended) the most common `kind`s:

- [`vibe coding`](https://search.dergigi.com/?q=vibe%20coding) - anything that mentions "vibe coding"
- [`by:fiatjaf`](https://search.dergigi.com/?q=by%3Afiatjaf) - find events from fiatjaf
- [`GM by:dergigi`](https://search.dergigi.com/?q=GM%20by%3Adergigi) - find "GM" messages from dergigi
- [`GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc`](https://search.dergigi.com/?q=GN%20by%3Anpub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc) - "GN" by npub
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

ants supports bech32-encoded entities as per NIP-19, just like [njump.me](https://njump.me/) and other portals do:

- [`/p/_@dergigi.com`](https://search.dergigi.com/p/_@dergigi.com) - profile by NIP-05 identifier
- [`/p/npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc`](https://search.dergigi.com/p/npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc) - direct profile by npub
- [`/p/dergigi`](https://search.dergigi.com/p/dergigi) - profile search by username
- `/p/[id]` - view a specific profile by hex ID
- `/e/nevent1...` - event by nevent identifier
- `/e/note1...` - event by note identifier
- `/e/[id]` - event by 64-character hex ID
- `/t/asknostr` - one hashtag
- `/t/asknostr,devstr` - multiple hashtags

The `/t/` path supports multiple separators (comma, plus, and space).

## Relay Logic

There is hardcoded relays for search (NIP-50) as well as for general use.

Upon login, we retrieve the user's relays as per NIP-51 (kind:10002) and remove any blocked relays (kind:10006). We also retrieve the user's search relays (kind:10007) and use them for search queries in addition it to the hardcoded list of search relays.

When connecting to a relay we retrieve the `supported_nips` as per NIP-11. The relay list as well as the supported NIPs are shown in the relay status indicator. Relays that returned one or more of the results that are currently shown on the page are shown in blue. Relays that support NIP-50 show a magnifying glass. The relay icon in the relay status display allows for relay-based client-side filtering of results.

## Search Logic

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

1. `kind:9802 by:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6`
2. `#YESTR by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc`

None of these need search. (1) is simply `kind:9802` with `authors: [6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93]` and (2) is simply `t:yestr` with Gigi's npub converted to hex.

However, if we have something like `has:video by:HODL` we will have to hit NIP-50 relays, because `has:video` expands to `.mp4 OR .webm OR .mov ...` and thus we'll have to do a full-text search.

## Profile Lookups and Vertex Logic

When resolving a `by:` or `p:` search, we try to do a best-effort profile lookup. If the user is logged in we use the Vertex DVM to do the profile lookup, using `personalizedPagerank`.

In short:

```python
if logged_in:
    profile = get_profile_from_vertex("search string")
else:
    profile = get_profile_from_fallback("search string")
```

The fallback is a NIP-50 search that attempts to do a "smart" ranking of profile results to figure out the most real (most relevant) profile. But it might be wrong. For reliable results users should login and use Vertex.

Profile searches might be a plaintext search like `gigi` or `dergigi`, npubs like `npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc` or NIP-05 identifiers like `me@dergigi.com`, or top-level NIP-05 identifiers like `dergigi.com` (which is equivalent to `@dergigi.com` or `_@dergigi.com`).

If it's a valid NIP-05 we should be able to get the hex of the npub straight up, without having to hit a search relay. If it's a plaintext search like `fiatjaf` we basically do a `kind:0 fiatjaf`, i.e. a NIP-50 search for profile events (hitting NIP-50 relays exclusively).

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

### Deployment Configuration

Set the public site URL (used for Open Graph/Twitter metadata) via environment variable:

```bash
NEXT_PUBLIC_SITE_URL=https://search.dergigi.com
```

You can place this in a local `.env` file.

### Search substitutions

All search substitutions (site aliases, media type expansions, etc.) are loaded from [`replacements.txt`](public/replacements.txt). This file contains the mappings for `site:`, `is:`, and `has:` modifiers, making it easy to see what substitutions are currently available and add new ones.

Here are some excerpts:

```
...
site:gh => (github.com OR www.github.com OR gist.github.com)
site:quora => (quora.com OR www.quora.com OR m.quora.com)
site:hackernews => (news.ycombinator.com OR www.news.ycombinator.com)
site:hn => (news.ycombinator.com OR www.news.ycombinator.com)
...
has:video => (.mp4 OR .webm OR .ogg OR .ogv OR .mov OR .m4v)
...
is:profile => kind:0
is:tweet => kind:1
is:repost => kind:6
...
is:highlight => kind:9802
is:blogpost => kind:30023
is:muted => kind:10000
...
nip:99 => nips/blob/master/99.md
nip:B0 => nips/blob/master/B0.md
nip:C0 => nips/blob/master/C0.md
nip:EE => nips/blob/master/EE.md
...

```

It's probably very stupid to do it this way, but I [went with the flow](https://www.thewayofcode.com/) and stuck with it. In the future each line might be a nostr event.

## TODOs, aka what I wanna do next

- [ ] don't do so many requests, lots of requests can be merged into one
- [ ] be nice to relays (respect limits etc)
- [ ] add support for code snippets (`kind:1337`)
- [ ] add proper support for blog posts (`kind:30023`)
- [ ] add "blossom search" to images (via sha256 hash)
- [ ] add a `/kinds` command that shows all substitutions
- [ ] explain what the different icons and symbols mean somehow
- [ ] move some things around in the UI
- [ ] make stuff less stupid and buggy overall

## References

- NIP-05: https://github.com/nostr-protocol/nips/blob/master/05.md
- NIP-11: https://github.com/nostr-protocol/nips/blob/master/11.md
- NIP-19: https://github.com/nostr-protocol/nips/blob/master/19.md
- NIP-50: https://github.com/nostr-protocol/nips/blob/master/50.md
- NIP-51: https://github.com/nostr-protocol/nips/blob/master/51.md
- Vertex: https://vertexlab.io/docs/algos/

## License

MIT License. See [LICENSE](LICENSE) for details.
