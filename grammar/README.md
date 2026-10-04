# Shared query grammar

Language version: **1**. Generator and TypeScript runtime: **ANTLR 4.13.2**.

[AntsQuery.g4](AntsQuery.g4) contains no target-specific actions. The web app commits generated TypeScript into `src/lib/search/query/generated`; normal builds require only Node, not Java. Java 17 is required to regenerate:

```sh
npm ci
npm run generate:query
```

The generator script downloads the official jar into ignored `.cache/antlr`, verifies its pinned SHA-256, and generates deterministic TypeScript. CI regenerates and checks for differences. Change the grammar, generated sources, syntax documentation, and fixtures together. Do not edit generated sources manually.

The web implementation has four stages:

1. `parse.ts` builds a query tree with UTF-16 source spans and rejects syntax errors.
2. `plan.ts` expands aliases as trees, safely compacts same-field alternatives, checks branch cost, and compiles branch-local constraints.
3. `execute.ts` resolves identity groups, checks structured event admission, and bounds concurrent work.
4. `search.ts` connects the plan to existing Nostr subscriptions, profile lookup, and identifier lookup.

The application never executes ANTLR's recovered parse tree: the first lexer/parser error throws a position-bearing error. The lexer token pass checks nesting before recursive parsing. Unknown modifiers and field-value errors are semantic validation failures.

## Android handoff

Android integration is not included in this change. Consume this directory at a pinned repository commit; the grammar version and commit together identify the source artifact. Generate Java with the same jar:

```sh
java -jar .cache/antlr/antlr-4.13.2-complete.jar \
  -Dlanguage=Java -no-listener -visitor \
  -package org.dergigi.ants.query.generated \
  -Xexact-output-dir -o /tmp/ants-query-java grammar/AntsQuery.g4
```

Use `org.antlr:antlr4-runtime:4.13.2` from Kotlin. Build a Kotlin adapter rather than embedding Kotlin or Java actions in the grammar. Compile the tree into the existing Android `SearchBranch` representation. Alias definitions and semantic rules must be synchronized as well as parsing.

[fixtures/queries.json](fixtures/queries.json) is versioned, language-neutral input. Valid cases specify expected filters, unresolved author groups, profile terms, or search strings at a fixed clock and default kind set. Invalid cases cover both syntax and semantic failures; Android must validate both layers before it can claim conformance. The TypeScript tests also exercise alias expansion, source spans, and every published example.

Use the same precedence, source-offset units, date semantics, list intersections, and expansion limits on both platforms. A shared grammar by itself does not enforce these semantic decisions.
