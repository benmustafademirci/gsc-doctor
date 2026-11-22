# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-22

First public version.

### Added

- `npx gsc-doctor --demo`: a full report for a fictional site on example.com
  from built-in synthetic data, in well under a second, with no account.
- Search Console connection with zero dependencies: service account keys
  (recommended), gcloud Application Default Credentials, or a ready-made
  access token (`GSC_ACCESS_TOKEN`). `gsc-doctor sites` lists accessible
  properties; `--site example.com` resolves to the matching property.
- Comparison of the last 28 days with the previous 28 days (`--days` to
  change), using complete ("final") days only.
- Deterministic diagnostics with documented, configurable thresholds:
  - striking-distance queries (positions 4–20) with the upside at position 3;
  - low CTR for the position, judged per query against a CTR curve learned
    from the site's own non-brand queries;
  - losing pages and queries, classified as disappeared, ranking drop,
    demand drop, CTR drop or mixed, with an exact impressions-vs-CTR split;
  - keyword cannibalization, with `#fragment` URLs merged into their page;
  - a single prioritised to-do list (estimated clicks × confidence ÷ effort).
- Single-file HTML report: inline CSS and SVG charts, no external requests,
  light and dark themes, print-friendly, tooltips, mobile layout.
- Terminal summary with the top actions; `--json` export of every finding.
- Optional Gemini layer (`GEMINI_API_KEY`): plain-language summary, next
  steps and new title/meta description ideas with structured JSON output.
  `--model`, `--ai-lang` and `--no-ai` options. Without a key everything else
  works unchanged.
- `gsc-doctor.config.json` for thresholds and brand terms (`--brand`).

[Unreleased]: https://github.com/benmustafademirci/gsc-doctor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/benmustafademirci/gsc-doctor/releases/tag/v0.1.0
