# Code Map

This directory contains a Graphify map of the codebase from commit `129dbecf`.

Open `/code-map/graphify-out/graph.html` from any deployed build for the
interactive view. Use `public/code-map/graphify-out/GRAPH_REPORT.md` for the text
summary and `public/code-map/graphify-out/graph.json` for Graphify queries.
The generated clusters are named from the main files and symbols they contain so
the browser filters and report can be scanned without placeholder labels.

Regenerate the map from the repository root:

```bash
graphify extract . --code-only --out public/code-map
graphify cluster-only public/code-map --no-label
jq -c . public/code-map/graphify-out/graph.json > /tmp/ants-graph.json
mv /tmp/ants-graph.json public/code-map/graphify-out/graph.json
```
