# Code Map

The checked-in Graphify map is a historical snapshot. Its source commit is recorded
in `built_at_commit` in `public/code-map/graphify-out/graph.json` and in the report.
Regeneration analyzes the checkout at generation time, so the map can become stale.

Open `/code-map/graphify-out/graph.html` from any deployed build for the
interactive view. Use `public/code-map/graphify-out/GRAPH_REPORT.md` for the text
summary and `public/code-map/graphify-out/graph.json` for Graphify queries.
The generated clusters are named from the main files and symbols they contain.

Regenerate the map from the repository root with Graphify installed:

```bash
graphify extract . --code-only --out public/code-map
graphify cluster-only public/code-map --no-label
python3 scripts/code-map-report.py
```

The report script reads the stored graph directly. It derives node counts,
cluster listings, and extraction percentages from that data and formats symbol
names as Markdown code. To refresh only the report, run the Python command alone;
this does not change the graph or its recorded source commit.
