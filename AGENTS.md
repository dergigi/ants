# AGENTS.md — ants

Instructions for AI agents working on this codebase. **These rules are mandatory, not suggestions.**

## Before You Code

- **Read before writing.** Never modify a file you haven't read. Understand existing patterns before adding code.
- **Check existing issues.** Search open AND closed issues before creating new ones. Duplicate issues waste maintainer time.

## PR Discipline

- **Commit early and often.** Use conventional commits (`feat:`, `fix:`, `test:`, `docs:`). Always commit after each implementation step or change — do not accumulate large uncommitted diffs.
- **Resolve ALL review comments before requesting merge.** This means every coderabbit comment, every reviewer thread. If you disagree with a suggestion, explain why in the thread — do not ignore it.
- **One concern per PR.** Do not sneak unrelated changes into a PR. If you discover a bug while working on a feature, file a separate issue.
- **Commits must be logically distinct.** Each commit should compile and pass tests independently. Do not batch unrelated changes into one commit.
- **Never commit to the wrong branch.** Verify your branch before committing. If you're on `fix/foo`, your commits must only contain `foo`-related changes.

## Code Style

- **Match the existing patterns exactly.** This codebase uses specific patterns for:
  - Card components (`ArticleCard`, `ListingCard`, etc.) — follow the props interface, footer, and container class patterns
  - Search strategies (`strategies/*.ts`) — follow the `tryHandle*` return-null-if-not-applicable pattern
  - Search modifiers — add to `replacements.txt`, not hardcoded
  - Kind constants — define in `constants.ts`, import where needed
- **No over-engineering.** If three lines of code solve the problem, do not create an abstraction. No premature utilities, no speculative generalization.
- **No unnecessary dependencies.** Prefer pure TypeScript implementations over npm packages for small utilities (see `geohash.ts` as example).

## Testing

- **Unit tests go in `__tests__/` adjacent to the module.** Follow `jest` + `ts-jest` patterns. Mock NDK at the module level before imports.
- **E2E tests go in `e2e/`.** Playwright, targeting `localhost:7473`. Tests must not depend on specific relay content — assert no crashes, not specific results.
- **Every new feature or search modifier must have an e2e test.** At minimum: verify the query loads without JS errors and the search input remains functional. Use `page.on('pageerror')` to catch uncaught exceptions.
- **E2E selectors:** Use `'[class*="bg-[#2d2d2d]"]'` for result cards. Avoid `data-testid` (was tried and reverted).
- **E2E waits:** Prefer signal-based waits over fixed timeouts. Use `await expect(locator).toBeVisible()` (auto-polls), `locator.waitFor()`, or `page.waitForResponse()`. Fixed `page.waitForTimeout()` is flaky and should be a last resort. Allow up to 45s timeout for relay results in assertions.
- **Run `npx tsc --noEmit` and `npm test` before committing.** Do not commit code that fails type checking or breaks existing tests.

## Search Architecture

- Default search kinds: `[1, 20, 21, 22, 9802, 30023, 39089]`. These are the only kinds searched when no `kind:` or `is:` modifier is specified.
- New kinds need: (1) constant in `constants.ts`, (2) entry in `replacements.txt`, (3) rendering in `SearchView.tsx` kind dispatch chain, (4) card component if non-trivial.
- Search strategies run in order in `searchOrchestrator.ts` — first match wins. Put specific strategies before general ones.
- `replacements.txt` is fetched at runtime, not compiled — changes take effect without rebuild.

## Nostr Specifics

- Event rendering falls through to `RawEventJson` for unknown kinds. This is intentional — ants embraces false positives.
- NIP-50 (relay-side search) is the primary search mechanism. Not all relays support it.
- Relay `#tag` filters use **exact match**, not prefix match. Design accordingly (see geohash multi-precision strategy).
- Always reference the relevant NIP spec in issue descriptions and PR bodies.

## Things That Will Get Your PR Rejected

- Modifying files you didn't read first
- Leaving coderabbit or reviewer comments unresolved
- Mixing unrelated changes in one PR
- Adding npm dependencies for things achievable in <100 lines of TypeScript
- Breaking existing tests
- Committing without running type check
