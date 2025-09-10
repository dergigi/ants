# Search Term Mappings

This file defines the DSL expansions for search modifiers. The implementation can parse these blocks to build seed terms and host lists.

Notes:
- Parentheses group OR-terms; commas separate multiple tokens in a single modifier.
- `is:` is stricter than `has:` in implementation (exactly one media vs any), but both map to the same extension seeds here.

### `is:`

```
image => (.png OR .jpg OR .jpeg OR .gif OR .gifs OR .apng OR .webp OR .avif OR .svg)
video => (.mp4 OR .webm OR .ogg OR .ogv OR .mov OR .m4v)
gif   => (.gif OR .gifs OR .apng)
```

### `has:`

```
image => (.png OR .jpg OR .jpeg OR .gif OR .gifs OR .apng OR .webp OR .avif OR .svg)
video => (.mp4 OR .webm OR .ogg OR .ogv OR .mov OR .m4v)
gif   => (.gif OR .gifs OR .apng)
```

### `site:`

```
# Core social/content sites
youtube => (youtube.com OR youtu.be OR m.youtube.com OR www.youtube.com OR youtube-nocookie.com)
reddit  => (reddit.com OR www.reddit.com OR old.reddit.com OR new.reddit.com OR m.reddit.com OR reddit.co)
twitter => (twitter.com OR www.twitter.com OR m.twitter.com OR x.com OR t.co)
wikipedia => (wikipedia.org OR en.wikipedia.org OR www.wikipedia.org OR m.wikipedia.org)
facebook => (facebook.com OR www.facebook.com OR m.facebook.com OR fb.com)
instagram => (instagram.com OR www.instagram.com OR m.instagram.com)
linkedin => (linkedin.com OR www.linkedin.com OR m.linkedin.com OR lnkd.in)
pinterest => (pinterest.com OR www.pinterest.com OR m.pinterest.com)
tumblr  => (tumblr.com OR www.tumblr.com OR m.tumblr.com)
flickr  => (flickr.com OR www.flickr.com OR m.flickr.com)
github  => (github.com OR www.github.com OR gist.github.com)
quora   => (quora.com OR www.quora.com OR m.quora.com)

# Common aliases mapping to the same host sets
yt   => (youtube.com OR youtu.be OR m.youtube.com OR www.youtube.com OR youtube-nocookie.com)
x    => (twitter.com OR www.twitter.com OR m.twitter.com OR x.com OR t.co)
wiki => (wikipedia.org OR en.wikipedia.org OR www.wikipedia.org OR m.wikipedia.org)
fb   => (facebook.com OR www.facebook.com OR m.facebook.com OR fb.com)
ig   => (instagram.com OR www.instagram.com OR m.instagram.com)
gh   => (github.com OR www.github.com OR gist.github.com)
```

### `by:` (author)

```
# Not an expansion; implementation should resolve npub or lookup usernames.
# Examples: by:npub1..., by:jack
```

### NIP-50 passthrough keys

```
include:spam
domain:<domain>
language:<xx>
sentiment:<negative|neutral|positive>
nsfw:<true|false>
```

