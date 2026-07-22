# Code Map

This directory contains a Graphify map of the codebase from commit `129dbecf`.

Open `graphify-out/graph.html` in a browser for the interactive view. Use
`graphify-out/GRAPH_REPORT.md` for the text summary and `graphify-out/graph.json`
for Graphify queries.

Regenerate the map from the repository root:

```bash
graphify extract . --code-only --out docs/code-map
graphify cluster-only docs/code-map --no-label
jq -c . docs/code-map/graphify-out/graph.json > /tmp/ants-graph.json
mv /tmp/ants-graph.json docs/code-map/graphify-out/graph.json
```
