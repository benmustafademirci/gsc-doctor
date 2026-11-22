/**
 * Report stylesheet. Color roles follow a validated, colorblind-checked
 * palette; light and dark values are defined once as custom properties.
 */
export const STYLES = String.raw`
:root {
  color-scheme: light;
  --page: #f6f6f3;
  --surface: #fcfcfb;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #7a7873;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11, 11, 11, 0.10);
  --chip: rgba(11, 11, 11, 0.05);
  --s-cur: #2a78d6;
  --s-prev: #b3b1a9;
  --s-flag: #eb6834;
  --s-other: #cfcdc5;
  --seg-1: #2a78d6;
  --seg-2: #eb6834;
  --seg-3: #1baf7a;
  --seg-other: #b3b1a9;
  --good: #006300;
  --bad: #c0302f;
  --critical: #d03b3b;
  --warning: #fab219;
  --tip-bg: #1f1f1d;
  --tip-ink: #f0efec;
  --accent-wash: rgba(42, 120, 214, 0.08);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface: #1a1a19;
    --ink: #f0efec;
    --ink-2: #c3c2b7;
    --muted: #8f8d87;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255, 255, 255, 0.10);
    --chip: rgba(255, 255, 255, 0.07);
    --s-cur: #3987e5;
    --s-prev: #5f5e59;
    --s-flag: #d95926;
    --s-other: #45443f;
    --seg-1: #3987e5;
    --seg-2: #d95926;
    --seg-3: #199e70;
    --seg-other: #5f5e59;
    --good: #0ca30c;
    --bad: #e66767;
    --tip-bg: #f0efec;
    --tip-ink: #0b0b0b;
    --accent-wash: rgba(57, 135, 229, 0.12);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #8f8d87;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255, 255, 255, 0.10); --chip: rgba(255, 255, 255, 0.07);
  --s-cur: #3987e5; --s-prev: #5f5e59; --s-flag: #d95926; --s-other: #45443f;
  --seg-1: #3987e5; --seg-2: #d95926; --seg-3: #199e70; --seg-other: #5f5e59;
  --good: #0ca30c; --bad: #e66767; --tip-bg: #f0efec; --tip-ink: #0b0b0b; --accent-wash: rgba(57, 135, 229, 0.12);
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
a { color: inherit; text-decoration-color: var(--axis); text-underline-offset: 2px; }
a:hover { text-decoration-color: currentColor; }
.wrap { max-width: 1060px; margin: 0 auto; padding: 28px 16px 72px; }
.num, td.num, .tabular { font-variant-numeric: tabular-nums; }

/* Header */
.brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; color: var(--ink-2); }
.brand svg { width: 26px; height: 26px; }
.brand .ver { font-weight: 400; color: var(--muted); }
.top h1 { font-size: clamp(26px, 4.4vw, 40px); line-height: 1.15; margin: 18px 0 8px; letter-spacing: -0.02em; font-weight: 650; }
.top h1 .site { color: var(--s-cur); overflow-wrap: anywhere; }
.top .meta { color: var(--ink-2); margin: 0; font-size: 14px; }
.ribbon { display: inline-block; margin-top: 14px; padding: 6px 12px; border-radius: 12px; background: var(--accent-wash); color: var(--ink-2); font-size: 13px; }
.ribbon strong { color: var(--ink); margin-right: 6px; }
nav.toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 0; }
nav.toc a { text-decoration: none; font-size: 13px; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--ink-2); }
nav.toc a:hover { color: var(--ink); border-color: var(--axis); }
nav.toc .count { color: var(--muted); margin-left: 4px; }

/* Layout */
section { margin-top: 44px; }
section > h2 { display: flex; align-items: baseline; gap: 10px; font-size: 22px; margin: 0 0 6px; letter-spacing: -0.01em; }
section > h2 .idx { font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: 0.06em; }
section > .lede { color: var(--ink-2); margin: 0 0 16px; max-width: 72ch; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
.card + .card { margin-top: 12px; }
.grid-2 > .card + .card { margin-top: 0; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 820px) { .grid-2 { grid-template-columns: 1fr; } }
.card h3 { margin: 0 0 10px; font-size: 15px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.empty { color: var(--ink-2); padding: 18px 20px; }

/* Stat tiles */
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 26px; }
@media (max-width: 820px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 16px 10px; min-width: 0; }
.kpi .label { font-size: 13px; color: var(--ink-2); }
.kpi .value { font-size: clamp(24px, 3.4vw, 32px); font-weight: 650; letter-spacing: -0.02em; margin-top: 2px; }
.kpi .delta { font-size: 13px; font-weight: 600; }
.kpi .delta .vs { font-weight: 400; color: var(--muted); }
.delta.up-good, .delta.down-good { color: var(--good); }
.delta.up-bad, .delta.down-bad { color: var(--bad); }
.delta.flat { color: var(--muted); }
.spark { display: block; width: 100%; height: 44px; margin-top: 6px; }

/* Summary */
.summary-list { margin: 0; padding-left: 18px; }
.summary-list li { margin: 4px 0; }
.ai-card .tag { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--accent-wash); color: var(--ink-2); margin-left: 6px; font-weight: 500; }
.ai-card p { margin: 0 0 10px; }
.hint { font-size: 13px; color: var(--ink-2); background: var(--chip); padding: 10px 12px; border-radius: 10px; margin-top: 12px; }
code { font: 0.9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--chip); padding: 1px 5px; border-radius: 5px; }

/* Actions */
ol.actions { list-style: none; margin: 0; padding: 0; counter-reset: action; }
ol.actions > li { display: grid; grid-template-columns: 36px 1fr auto; gap: 4px 14px; align-items: start; padding: 16px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; margin-bottom: 8px; }
ol.actions .rank { font-size: 18px; font-weight: 650; color: var(--muted); font-variant-numeric: tabular-nums; line-height: 1.4; }
ol.actions .title { font-weight: 600; overflow-wrap: anywhere; }
ol.actions .detail { color: var(--ink-2); font-size: 14px; margin-top: 2px; overflow-wrap: anywhere; }
ol.actions .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
ol.actions .gain { text-align: right; white-space: nowrap; }
ol.actions .gain strong { display: block; font-size: 18px; letter-spacing: -0.01em; }
ol.actions .gain span { font-size: 12px; color: var(--muted); }
@media (max-width: 640px) {
  ol.actions > li { grid-template-columns: 28px 1fr; }
  ol.actions .gain { grid-column: 2; text-align: left; }
  ol.actions .gain strong { display: inline; margin-right: 6px; }
}
.badge { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; line-height: 1.6; }
.badge.high { background: var(--critical); color: #fff; }
.badge.medium { background: var(--warning); color: #0b0b0b; }
.badge.low { background: var(--chip); color: var(--ink-2); }
.chip { display: inline-flex; align-items: center; font-size: 12px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--border); color: var(--ink-2); line-height: 1.6; }
.cause { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
.cause::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.cause.disappeared::before { background: var(--critical); }
.cause.ranking-drop::before { background: var(--s-flag); }
.cause.ctr-drop::before { background: var(--warning); }
.cause.demand-drop::before { background: var(--s-prev); }

/* Tables */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-size: 12px; font-weight: 600; color: var(--muted); padding: 0 10px 8px; border-bottom: 1px solid var(--axis); white-space: nowrap; }
td { padding: 11px 10px; border-bottom: 1px solid var(--grid); vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
th.num, td.num { text-align: right; white-space: nowrap; }
td.key { min-width: 200px; overflow-wrap: anywhere; }
td.key .sub { display: block; font-size: 12px; color: var(--muted); }
.card.table { padding: 14px 10px 6px; }
details.more { margin-top: 8px; }
details.more > summary { cursor: pointer; color: var(--ink-2); font-size: 14px; padding: 8px 10px; list-style: none; }
details.more > summary::-webkit-details-marker { display: none; }
details.more > summary::before { content: "▸ "; color: var(--muted); }
details.more[open] > summary::before { content: "▾ "; }
.meter { display: inline-block; width: 90px; height: 8px; border-radius: 4px; background: var(--chip); vertical-align: middle; margin-left: 8px; }
.meter > span { display: block; height: 100%; border-radius: 4px; background: var(--s-cur); min-width: 2px; }
.ctrpair { display: inline-grid; gap: 3px; width: 110px; vertical-align: middle; margin-left: 8px; }
.ctrpair span { display: block; height: 6px; border-radius: 3px; }
.ctrpair .actual { background: var(--s-flag); }
.ctrpair .expected { background: var(--s-prev); }
.track { width: 150px; height: 18px; display: block; }
.track-line { stroke: var(--grid); stroke-width: 2; stroke-linecap: round; }
.track-goal { fill: var(--accent-wash); stroke: var(--s-cur); stroke-opacity: 0.35; stroke-width: 1; }
.track-gap { stroke: var(--s-cur); stroke-width: 2; stroke-dasharray: 2 3; stroke-opacity: 0.6; }
.split { position: relative; display: inline-block; width: 160px; height: 12px; vertical-align: middle; }
.split::before { content: ""; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--axis); }
.split > span { position: absolute; top: 0; height: 12px; }
.split .vol { background: var(--seg-1); }
.split .ctr { background: var(--seg-2); }
.split .neg-out { border-radius: 4px 0 0 4px; }
.split .pos-out { border-radius: 0 4px 4px 0; }
.legend-inline { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--ink-2); margin: 0 0 10px; }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.sw.vol { background: var(--seg-1); } .sw.ctr { background: var(--seg-2); }

/* Low CTR details */
.row-detail td { background: var(--chip); padding: 12px 14px 14px; }
.row-detail .queries { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
.snippet { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
@media (max-width: 760px) { .snippet { grid-template-columns: 1fr; } }
.snippet h4 { margin: 0 0 4px; font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.snippet .serp-title { color: var(--s-cur); font-size: 15px; }
.snippet .serp-desc { color: var(--ink-2); font-size: 13px; }
.snippet ul { margin: 0; padding-left: 18px; }
.missing { color: var(--muted); font-style: italic; }

/* Cannibalization */
.cannibal h3 { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
.cannibal h3 .stats { font-size: 13px; color: var(--muted); font-weight: 400; }
.seg { display: flex; gap: 2px; height: 28px; margin: 6px 0 12px; }
.seg > span { border-radius: 4px; display: flex; align-items: center; padding: 0 8px; color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; min-width: 4px; }
.seg .c1, .legend-list .c1 { background: var(--seg-1); }
.seg .c2, .legend-list .c2 { background: var(--seg-2); }
.seg .c3, .legend-list .c3 { background: var(--seg-3); }
.seg .c4, .legend-list .c4 { background: var(--seg-other); }
.legend-list { list-style: none; margin: 0; padding: 0; font-size: 14px; }
.legend-list li { display: grid; grid-template-columns: 14px 1fr auto; gap: 8px; align-items: baseline; padding: 4px 0; }
.legend-list .sw { width: 10px; height: 10px; margin: 0; }
.legend-list .page { overflow-wrap: anywhere; }
.legend-list .primary { font-size: 12px; color: var(--good); font-weight: 600; margin-left: 6px; white-space: nowrap; }
.legend-list .stats { color: var(--muted); font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; }

/* Charts */
figure.chart { margin: 0; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; font-size: 13px; color: var(--ink-2); margin-bottom: 8px; }

.lkey { display: inline-block; vertical-align: middle; }
.lkey.line { width: 16px; height: 0; border-top: 2px solid; border-radius: 2px; margin-right: 6px; }
.lkey.dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.legend .lkey { margin-right: 6px; }
.lkey.s-cur { border-color: var(--s-cur); }
.lkey.s-prev { border-color: var(--s-prev); }
.lkey.dot.s-flag { background: var(--s-flag); }
.lkey.dot.s-other { background: var(--s-other); }
.chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.chart-scroll svg { display: block; width: 100%; height: auto; min-width: 560px; }
svg text { font-family: inherit; }
.tick { fill: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.axis-title { fill: var(--muted); font-size: 12px; }
.grid { stroke: var(--grid); stroke-width: 1; }
.axis { stroke: var(--axis); stroke-width: 1; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.line.thin { stroke-width: 1.75; vector-effect: non-scaling-stroke; }
.line.s-cur { stroke: var(--s-cur); }
.line.s-prev { stroke: var(--s-prev); }
.area.s-cur { fill: var(--s-cur); opacity: 0.1; }
.dot { stroke: var(--surface); stroke-width: 2; }
.dot.s-cur { fill: var(--s-cur); }
.dot.s-prev { fill: var(--s-prev); }
.dot.s-flag { fill: var(--s-flag); }
.dot.s-other { fill: var(--s-other); }
.dot-label { fill: var(--ink); font-size: 12px; font-weight: 600; paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
[data-tip] { cursor: default; outline: none; }
g.flag:hover .dot, g.flag:focus .dot, circle[data-tip]:hover, circle[data-tip]:focus { stroke: var(--ink); }
.crosshair { stroke: var(--ink-2); stroke-width: 1; pointer-events: none; }
.tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.tabs label { font-size: 13px; padding: 5px 12px; border-radius: 999px; cursor: pointer; color: var(--ink-2); border: 1px solid transparent; }
.tab-input { position: absolute; opacity: 0; pointer-events: none; }
#tab-clicks:checked ~ .tabs label[for="tab-clicks"], #tab-impressions:checked ~ .tabs label[for="tab-impressions"] { background: var(--chip); color: var(--ink); border-color: var(--border); }
#tab-clicks:focus-visible ~ .tabs label[for="tab-clicks"], #tab-impressions:focus-visible ~ .tabs label[for="tab-impressions"] { outline: 2px solid var(--s-cur); }
.tab-panel { display: none; }
#tab-clicks:checked ~ .panel-clicks, #tab-impressions:checked ~ .panel-impressions { display: block; }

#tooltip { position: fixed; z-index: 10; display: none; pointer-events: none; max-width: 320px; background: var(--tip-bg); color: var(--tip-ink); border-radius: 10px; padding: 8px 11px; font-size: 13px; line-height: 1.45; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18); overflow-wrap: anywhere; }
#tooltip .t-title { font-weight: 600; margin-bottom: 2px; }
#tooltip .t-row { display: flex; align-items: center; gap: 8px; }
#tooltip .t-row strong { font-variant-numeric: tabular-nums; }
#tooltip .lkey.line { width: 12px; margin: 0; }

/* Methodology */
.method dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 0; font-size: 14px; }
.method dt { color: var(--ink-2); }
.method dd { margin: 0; font-variant-numeric: tabular-nums; }
.method p { color: var(--ink-2); font-size: 14px; }
footer { margin-top: 48px; color: var(--muted); font-size: 13px; text-align: center; }

@media print {
  body { background: #fff; font-size: 12px; }
  .wrap { max-width: none; padding: 0; }
  nav.toc, .tabs, details.more > summary { display: none; }
  .card, ol.actions > li, .kpi { break-inside: avoid; border-color: #ddd; }
  section { break-inside: auto; }
  .chart-scroll svg { min-width: 0; }
  .tab-panel { display: block !important; }
}
`;
