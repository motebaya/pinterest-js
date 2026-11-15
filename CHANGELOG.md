# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/):
patch = fixes, minor = backwards-compatible additions, major = breaking
changes to the CLI or the on-disk layout. `package.json` holds the
authoritative version; dates below are when each version was set in the
repository, not npm release dates (the package is not published to npm).

## [Unreleased]

### Security

- Updated the transitive `follow-redirects` package (pulled in by `axios`) to
  1.16.3, clearing three high-severity redirect-header advisories. No API or
  behaviour change.

### Changed

- Public documentation no longer points at internal development material
  (`audits/`, `reports/`, `artifacts/`, `trash/`), which is now excluded from
  the repository and kept local only.
- Added this changelog and a documented versioning policy.

No functional changes.

## [2.1.0] — 2026-09-16

### Added

- `-d, --output-dir` — per-run override for the output root.
- Interactive board download (`-b`): multi-board picker, then per board a
  choice of whole board, selected sections, or skip.
- Regression tests for board orchestration and output-path precedence.

### Fixed

- A carousel pin downloaded with `-p` saved only the first slot; every slot is
  now downloaded, in order.
- Progress rendering printed a literal `{current}` placeholder; byte progress
  now renders with human-readable sizes.
- Successful downloads could hang during progress-bar teardown on
  cli-progress 3.x, stalling batch runs after the first saved file.
- `PINTEREST_JS_OUTPUT_DIR` was ignored by metadata and cache writes.
- Board runs could print `Board "undefined"` and internal pagination chatter
  in normal output.
- Metadata and media now share one output-root resolution: flag > env > default.

### Changed

- README rewritten from verified behavior instead of intended behavior.
- Normal output is limited to user-facing progress and results; internal
  diagnostics moved behind `-V/--verbose`.

## [2.0.0] — 2026-09-16

### Added

- Rebuilt implementation with explicit layers: CLI → services → core
  (Pinterest, downloader, HLS, media) → config/util.
- Resource-registry extraction with bookmark pagination for feeds, boards and
  board sections.
- Hardened downloader: streamed `.part` writes, content-type/magic-byte/size
  validation, atomic rename, retries with exponential backoff.
- HLS → MP4 remux through bundled `ffmpeg-static`, best variant by pixel area,
  muxed or separate audio.
- Offline test suite on `node:test` (unit + integration with local HTTP servers
  and a locally generated HLS tree).

### Changed

- Requires Node.js 20 or newer.
- Metadata is written per user and per pin and doubles as the `-c/--cache`
  source.
- Gen-1 implementation preserved outside the tracked tree.

## [1.0.0] — 2025-05-31

### Added

- Initial implementation: Pinterest pin extraction, profile feed downloads,
  direct video downloads and basic HLS handling, winston-based logging.
