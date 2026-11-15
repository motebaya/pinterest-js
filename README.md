# pinterest-js

Download Pinterest media — single pins (images, videos, carousels) or a user's
feed/boards — from the command line.

Built around a resource-registry extraction layer, a hardened downloader
(validated, atomic writes), and HLS→MP4 conversion via a bundled ffmpeg.

## Requirements

- Node.js ≥ 20
- ffmpeg is bundled automatically via `ffmpeg-static` (no manual install)

## Install

```bash
git clone https://github.com/motebaya/pinterest-js
cd pinterest-js
npm install
```

The package is not yet published to npm. For a global command from a clone,
use `npm link` (or `npm install -g .`); after that, `pinterest-js …` works
everywhere. All examples below use the direct form that always works:

```bash
node src/cli.js …
```

## CLI usage

```text
node src/cli.js -p <pin-url|id> [-t image|video] [options]
node src/cli.js -u <username> --feed          download from the user's created-pins feed
node src/cli.js -u <username> --board         interactive board/section selection
node src/cli.js -c <username|pinId>           re-download from cached metadata
```

| Flag                            | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `-p, --pin <url\|id>`           | Single pin: full URL, bare id, or `pin.it` link                              |
| `-u, --username <name>`         | Pinterest username (with or without `@`)                                     |
| `-t, --type <image\|video>`     | Media type to download (default: `image`)                                    |
| `-f, --feed`                    | With `-u`: download the user's created-pins feed                             |
| `-b, --board`                   | With `-u`: pick boards/sections interactively                                |
| `-n, --pages <n>`               | Max pages to fetch per resource (default 100; ~25 pins/page)                 |
| `-c, --cache <username\|pinId>` | Re-download from previously saved metadata                                   |
| `-d, --output-dir <dir>`        | Output root for downloads and metadata (overrides `PINTEREST_JS_OUTPUT_DIR`) |
| `-m, --metadata`                | Save pin/user metadata JSON next to downloads                                |
| `-o, --overwrite`               | Re-download even if files exist (default: skip)                              |
| `-y, --yes`                     | Skip the download confirmation prompt                                        |
| `-V, --verbose`                 | Debug output (timestamps, scopes, HTTP log)                                  |

### Examples

All of these are real commands that were run against live Pinterest
responses while the current version was verified.

```bash
# single image pin
node src/cli.js -p https://www.pinterest.com/pin/1135610862296056785/

# single video pin (mp4 direct, or HLS converted via ffmpeg)
node src/cli.js -p 21532904464936103 -t video

# carousel pin — downloads every image in slot order
node src/cli.js -p https://www.pinterest.com/pin/1106618939716239771/

# a user's feed (images), capped to the first 2 pages, no confirm prompt
node src/cli.js -u seihin_ --feed -n 2 -y

# a user's feed as videos
node src/cli.js -u seihin_ --feed -t video

# interactive board download
node src/cli.js -u wendihariyanto49 --board

# re-download from saved metadata without re-extracting
node src/cli.js -c seihin_
```

## Pin, feed, board — what each mode does

**Pin (`-p`)** — extracts the pin page and downloads every media item of the
requested type. A carousel yields one file per slot in slot order; a video pin
prefers a native MP4 (`V_720P` first) and falls back to HLS → ffmpeg remux.

**Feed (`-u … --feed`)** — pages through the user's created-pins feed
(bookmark pagination, bounded by `-n/--pages`), then downloads media of the
requested type. Every mode funnels into the same selection → download →
summary pipeline.

**Board (`-u … --board`)** — lists the user's boards and prompts:

1. pick one or more boards (checkbox list, sorted by pin count)
2. for each board **that has sections**, choose: the whole board (pins + all
   sections), only some sections, or skip the board. Boards without sections
   download immediately.
3. the same download planner and summary are used as for feed/pin.

Cancel at any prompt with Ctrl+C (exit code 130). Selecting nothing skips the
run with a warning, not an error.

## Pagination (`-n/--pages`)

`-n` is a **hard cap on pages per resource request** (feed, board listing,
section listing, board pins, section pins — each capped independently). One
page is ~25 pins, so `-n 2` fetches at most ~50 pins per resource. The default
is 100; pagination always stops when Pinterest stops returning bookmarks, so
runs never issue unbounded requests.

## Metadata & cache

`-m/--metadata` writes JSON next to the downloads:

- `@<user>/<userId>.json` — user-level snapshot (feed/board runs): author +
  every pin with its media URLs. The file is named after Pinterest's numeric
  user id, or after the username when no id is available. This file is what
  `-c <username>` loads.
- `@<user>/<images|videos>/metadata/<pinId>.json` — per-pin snapshot; this is
  what `-c <pinId>` loads.

`-c/--cache` re-downloads from those files **without hitting Pinterest's
pages**. Note: stored media URLs are Pinterest CDN links that may expire —
if a cached re-download 403s, re-extract live instead.

## Output structure

```text
<output root>/
└── @<username>/
    ├── <userId>.json                  user metadata (with --metadata; the -c cache)
    ├── images/
    │   ├── <hash>.jpg
    │   └── metadata/<pinId>.json      per-pin metadata (with --metadata)
    └── videos/
        ├── <hash>.mp4
        └── metadata/<pinId>.json
```

The output root follows this precedence: `-d/--output-dir` flag >
`PINTEREST_JS_OUTPUT_DIR` environment variable >
`<project root>/pinterest-downloader-output`. The same root is used for
downloads and metadata/cache files.

## Existing files: skip vs overwrite

A file that already exists at its final path is **skipped** (reported as
`skipped` in the summary) unless `-o/--overwrite` is given. Partial downloads
are never left at the final path: everything is written to a `.part` temp file
first.

## Downloads you can trust

- Files are streamed to `<name>.part` and **validated before rename**:
  HTTP status, declared content type, magic-byte signature, minimum size.
  HTML error pages and truncated responses never masquerade as media.
- Writes are atomic (`rename`); an interrupted download leaves no partial file
  at the final path and never clobbers an existing valid file.
- Transient failures (timeouts, 429/5xx, socket resets, DNS hiccups) are
  retried — up to 3 attempts per media file with exponential backoff (1s, 2s);
  permanent failures (404/403) fail fast. Page/resource fetches are not
  retried: a failed extraction surfaces as an error for that run.
- HLS output is validated (size + MP4 box signature) before it is renamed.

## Terminal output

Normal mode is compact and readable. Real example (video pin):

```text
   ┌──────────────  Pin  ───────────────┐
   │                                    │
   │   Author: @lynclim                 │
   │   Title: -                         │
   │   Pin: 21532904464936103           │
   │   Type: video (mp4)                │
   │   Items: 1                         │
   │                                    │
   └────────────────────────────────────┘

✓ saved a4801e8a7696debe1b70ba2beaa5a03b_720w.mp4 (493.16 kB) as video/mp4
✓ done: 1 downloaded, 0 failed
```

Batch runs add a per-run header and a final summary box with
Downloaded / Skipped / Failed / Time. `-V/--verbose` adds timestamps, module
scopes, resource-level pagination diagnostics, and HTTP request/response
logging for diagnosis.

## Exit codes

| Code  | Meaning                                                         |
| ----- | --------------------------------------------------------------- |
| `0`   | Success (including runs where everything was skipped)           |
| `1`   | Runtime error (network, not found, download/validation, ffmpeg) |
| `2`   | Usage error (invalid username/pin input, missing action flag)   |
| `130` | Aborted by user (Ctrl+C at a prompt)                            |

## Testing / development

```bash
npm test            # unit + integration suite (offline; no Pinterest traffic)
npm run test:live   # manual live probe of the acceptance pins
```

The suite uses Node's built-in test runner (`node:test`). Integration tests
spin up local HTTP servers and a locally generated HLS tree (via the bundled
ffmpeg) — they make **no network requests**. Live probes are separate by
design.

## Versioning

`package.json` is the single source of truth for the version and follows
[Semantic Versioning](https://semver.org/): patch for fixes, minor for
backwards-compatible additions, major for breaking CLI or on-disk changes.
Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md). No git tags or
npm releases exist yet — the project is distributed as a clone.

## Troubleshooting

- **"PinNotFound"** — the pin is deleted/invalid; verify the URL in a browser.
- **`E_APP_VERSION`** — Pinterest's profile page structure changed or is
  unreachable from your network; retry once, then assume the page contract
  changed upstream.
- **403 on media** — the CDN URL was stale (Pinterest expires old objects);
  re-extract instead of reusing saved URLs from old metadata.
- **ffmpeg errors** — ensure `ffmpeg-static` installed for your platform
  (`npm rebuild ffmpeg-static`); the error message includes ffmpeg's own
  stderr tail.
- **Corporate networks** — Pinterest blocks some IP ranges; blocked requests
  surface as `E_NETWORK`/HTTP 403 rather than hanging.

## Limitations

- No cookie/auth flows: private boards and age-restricted pins are not
  downloadable.
- `pin.it` short links resolve via redirect parsing; expired tokens surface a
  clear error (valid-token resolution verified only against the redirect
  path).
- Rate limits are unknown: requests are issued one at a time (no artificial
  delay) and page counts are capped, but large batches should still be run
  conservatively.
- Metadata is a snapshot: cached re-downloads (`-c`) rely on stored URLs,
  which Pinterest may expire.

## Project layout

```text
src/            active implementation (CLI → services → core → config/util)
test/           node:test suite (unit, integration, fixtures, live probe)
CHANGELOG.md    notable changes per version
```

Internal working material — `audits/`, `reports/`, `artifacts/` and `trash/`
— is kept on disk for local reference only and is excluded from the
repository; see [.gitignore](.gitignore).

## License

MIT — see [LICENSE](LICENSE).
