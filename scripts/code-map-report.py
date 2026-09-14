#!/usr/bin/env python3
"""Generate a consistent Markdown report from Graphify's stored graph."""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/code-map/graphify-out'


def code(value):
    text = str(value).replace('\n', ' ')
    fence = '`' * (max((len(part) for part in re.findall(r'`+', text)), default=0) + 1)
    return f'{fence} {text} {fence}' if '`' in text else f'{fence}{text}{fence}'


def main():
    graph = json.loads((OUTPUT / 'graph.json').read_text())
    nodes, edges = graph['nodes'], graph['links']
    groups = defaultdict(list)
    for node in nodes:
        groups[node['community']].append(node)
    confidence = Counter(edge.get('confidence', 'UNKNOWN') for edge in edges)
    degree = Counter()
    for edge in edges:
        degree.update((edge['source'], edge['target']))
    by_id = {node['id']: node for node in nodes}
    ordered_groups = sorted(groups.items())
    names = {key: members[0].get('community_name', f'Cluster {key}') for key, members in ordered_groups}
    percentages = ' · '.join(f'{count / len(edges):.2%} {kind} ({count} edges)' for kind, count in sorted(confidence.items())) if edges else 'No edges'
    lines = [
        '# Code Graph Report', '',
        'Generated from `graph.json` by `scripts/code-map-report.py`.', '',
        '## Summary', '',
        f'- {len(nodes)} nodes · {len(edges)} edges · {len(groups)} clusters (all shown)',
        f'- Extraction: {percentages}', '',
        '## Graph Freshness', '',
        f'- Built from commit: {code(graph.get("built_at_commit", "unknown"))}',
        '- This is a snapshot; compare that commit with the current checkout before relying on it.', '',
        '## Cluster Hubs', '',
    ]
    lines.extend(f'- {names[key]} ({len(members)} nodes)' for key, members in ordered_groups)
    lines += ['', '## Most Connected Nodes', '']
    for index, (node_id, count) in enumerate(degree.most_common(10), 1):
        node = by_id[node_id]
        lines.append(f'{index}. {code(node["label"])} — {count} incident edges; {code(node.get("source_file", ""))}')
    lines += ['', f'## Clusters ({len(groups)} total, all shown)', '']
    for key, members in ordered_groups:
        labels = ', '.join(code(node['label']) for node in members[:8])
        remaining = f' (+{len(members) - 8} more)' if len(members) > 8 else ''
        lines += [f'### {names[key]}', '', f'Nodes ({len(members)}): {labels}{remaining}', '']
    isolated = [node for node in nodes if degree[node['id']] == 0]
    lines += ['## Limitations', '',
              f'- {len(isolated)} nodes have no recorded edges.',
              '- Static extraction can miss runtime connections; inferred edges are not verified dependencies.',
              '- Cluster names are heuristic descriptions, not architectural boundaries.', '']
    (OUTPUT / 'GRAPH_REPORT.md').write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
