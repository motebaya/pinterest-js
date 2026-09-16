# pinterest-js

Download Pinterest media — single pins (images, videos, carousels) or a user's
whole feed/boards — from the command line.

Rebuilt from the ground up around a resource-registry extraction layer, a
hardened downloader (validated, atomic writes), and HLS→MP4 conversion via
ffmpeg.

## Requirements

- Node.js ≥ 20
- ffmpeg is bundled automatically via `ffmpeg-static` (no manual install)

## Install

```bash
git clone https://github.com/motebaya/pinterest-js
cd pinterest-js
npm install
```

or globally:

```bash
npm install -g pinterest-js
```

## CLI usage

```text
pinterest-js -p <pin-url|id> [-t image|video] [options]
pinterest-js -u <username> --feed          download from the user's created-pins feed
pinterest-js -u <username> --board         interactive board/section selection
pinterest-js -c <username|pinId>           re-download from cached metadata
```

| Flag | Description |
| --- | --- |
| `-p, --pin <url\|id>` | Single pin: full URL, bare id, or `pin.it` link |
| `-u, --username <name>` | Pinterest username (with or without `@`) |
| `-t, --type <image\|video>` | Media type to download (default: `image`) |
| `-f, --feed` | With `-u`: download the user's created-pins feed |
| `-b, --board` | With `-u`: pick boards/sections interactively |
| `-n, --pages <n>` | Max pages per resource (default 100, 25 pins/page) |
| `-c, --cache <username\|pinId>` | Re-download from previously saved metadata |
| `-m, --metadata` | Save pin/user metadata JSON next to downloads |
| `-o, --overwrite` | Re-download even if files exist (default: skip) |
| `-y, --yes` | Skip the download confirmation prompt |
| `-V, --verbose` | Debug output (timestamps, scopes, HTTP log) |

### Examples

```bash
# single image pin
pinterest-js -p https://www.pinterest.com/pin/1135610862296056785/

# single video pin (mp4 direct, or HLS converted via ffmpeg)
pinterest-js -p 21532904464936103 -t video

# carousel pin — downloads every image in slot order
pinterest-js -p https://www.pinterest.com/pin/1106618939716239771/

# a user's feed (images)
pinterest-js -u @seihin_ --feed

# a user's feed as videos, first 2 pages only, no prompt
pinterest-js -u seihin_ --feed -t video -n 2 -y

# interactive board download
pinterest-js -u wendihariyanto49 --board

# re-download from saved metadata without re-extracting
pinterest-js -c seihin_
```

## Supported content

| Type | Behavior |
| --- | --- |
| Image pins | Best-quality URL (`orig` when served) |
| Carousel pins | One image per slot, in slot order, collision-free filenames |
| Video pins | Direct MP4 when Pinterest serves one (`V_720P` preferred); otherwise HLS master playlist → best variant → ffmpeg remux to MP4 |
| Deleted/invalid pins | Clean `E_PIN_NOT_FOUND` error, exit code 1 |
| Boards | Board listing → per-board pins + sections (interactive selection) |
| Feed | Created-pins feed with bookmark pagination, bounded by `--pages` |

## Output structure

```text
pinterest-downloader-output/
└── @<username>/
    ├── <userId>.json                  user metadata (with --metadata; also the -c cache)
    ├── images/
    │   ├── <hash>.jpg
    │   └── metadata/<pinId>.json      per-pin metadata (with --metadata)
    └── videos/
        ├── <hash>.mp4
        └── metadata/<pinId>.json
```

Override the output root with the `PINTEREST_JS_OUTPUT_DIR` environment
variable.

## Downloads you can trust

- Files are streamed to `<name>.part` and **validated before rename**:
  HTTP status, declared content type, magic-byte signature, minimum size.
  HTML error pages and truncated responses never masquerade as media.
- Writes are atomic (`rename`); an interrupted download leaves no partial file
  at the final path and never clobbers an existing valid file.
- Transient failures (timeouts, 429/5xx, socket resets) retry up to 3 times
  with backoff; permanent failures (404/403) fail fast.
- Existing files are skipped unless `--overwrite` is given.

## Terminal output

Normal mode is compact and readable:

```text
→ resolving pin page
   ┌───────────  Pin  ────────────┐
   │   Author: @lynclim           │
   │   Type: video (mp4)          │
   │   Size: 1280x720             │
   └──────────────────────────────┘

✓ saved a4801e8a…_720w.mp4 (493.16 kB) as video/mp4
✓ done: 1 downloaded, 0 failed
```

`-V/--verbose` adds timestamps, module scopes, and HTTP request/response
logging for diagnosis. A final summary box reports Downloaded / Skipped /
Failed / Time for batch runs.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (including runs where everything was skipped) |
| `1` | Runtime error (network, not found, download/validation, ffmpeg) |
| `2` | Usage error (invalid username/pin input, missing action flag) |
| `130` | Aborted by user (Ctrl+C) |

## Testing / development

```bash
npm test        # unit + integration suite (offline; no Pinterest traffic)
npm run test:live   # manual live probe of the three acceptance pins
```

The suite uses Node's built-in test runner (`node:test`). Integration tests
spin up local HTTP servers and a locally generated HLS tree (via the bundled
ffmpeg) — they make **no network requests**. Live probes are separate by
design; see `reports/04-testing-qa.md` for the framework rationale and
results, and `reports/final-report.md` for live acceptance outcomes.

## Troubleshooting

- **"PinNotFound"** — the pin is deleted/invalid; verify the URL in a browser.
- **`E_APP_VERSION`** — Pinterest's profile page structure changed or is
  unreachable from your network; retry, or check `reports/` for the current
  extraction contract.
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
- Rate limits unknown by design: the tool paces sequentially and caps pages;
  don't run large batches aggressively.
- Metadata is a snapshot: cached re-downloads (`-c`) rely on stored URLs, which
  Pinterest may expire.

## Project layout

```text
src/            active implementation (CLI → services → core → config/util)
test/           node:test suite (unit, integration, fixtures, live probe)
reports/        reconstruction/QA documentation with real verification data
artifacts/      preserved history: Gen-1 code, captures, research probes
audits/         pre-reconstruction audit documents (historical)
```

## License

MIT — see [LICENSE](LICENSE).
