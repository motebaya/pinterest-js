# Pinterest-JS — Full Reconstruction, Modernization & Completion Mission

You are acting as the **primary senior engineer responsible for recovering, reconstructing, modernizing, testing, and completing this project**.

The project is `pinterest-js`, a Node.js CLI application intended to download Pinterest media anonymously without login, including images, videos, pins, boards, and related resources.

The project was dormant for months and contains multiple generations of implementation, unfinished migration work, reverse-engineering artifacts, broken tests, legacy code, and partially implemented architecture.

Your job is **not merely to audit the project**.

Your job is to take the project from its current state to a **professionally structured, maintainable, tested, documented, and actually working state**.

You have authority to make engineering decisions without repeatedly asking the user.

---

# 0. Operating Mode

Work autonomously.

You may spend substantial time reasoning, inspecting files, tracing execution paths, running experiments, writing tests, modifying architecture, and validating real behavior.

**Do not stop simply because you found an ambiguity.**

If you encounter a decision such as:

- which architecture to use
- whether a module should be merged or split
- whether legacy code should be removed
- whether an abstraction should be introduced
- how configuration should be modeled
- how extraction should be structured
- how retry/error handling should work
- how media validation should work
- how HLS handling should be organized
- how tests should be structured
- whether a piece of old code is still useful
- whether a behavior should be preserved or redesigned

make the best engineering decision yourself.

You have explicit authority to choose.

Only ask the user if there is a decision that is **fundamentally impossible to resolve through repository evidence, experimentation, or reasonable engineering judgment**, or if an external credential/account/secret is absolutely required.

Do not ask for confirmation for ordinary engineering decisions.

---

# 1. Important Context From Previous Audit

A comprehensive audit has already been performed.

Treat the existing audit reports as **evidence and historical context**, not as immutable architecture requirements.

The current project contains two major generations.

## Generation 1

The older implementation lives primarily in:

- `lib/`
- root `main.js`
- root `cli.js`

It appears to have been historically functional and currently provides the most complete end-to-end bulk-download behavior.

However, it is legacy architecture and should not automatically become the final architecture.

## Generation 2

The newer implementation lives primarily in:

- `src/`

The package metadata points to this generation.

The newer architecture contains:

- configuration system
- extraction layer
- downloader
- HLS handling
- services
- logging
- utilities
- board/feed concepts
- RS_CONFIG/resource configuration
- improved CLI concepts

However, this migration was never completed.

Important known problems include:

- `src/main.js` contains an unconditional `process.exit()` that makes the intended feed loop unreachable.
- `--pages` is accepted but does not correctly propagate into pagination.
- board orchestration is incomplete.
- `RS_CONFIG["user.board.allContent"]` aliases a non-existent configuration.
- tests target a third/phantom architecture that does not exist anymore.
- `-c` can crash when username is missing.
- some modules and barrel files are unused.
- cache behavior is inconsistent.
- metadata paths differ from documentation.
- downloaded files are not sufficiently validated against false-success/HTML/partial-content cases.
- some root JSON files are captured Pinterest responses.
- `error.txt` contains sensitive external data and must be treated carefully.
- `trash/` contains historical experiments and ancestry.
- HLS artifacts exist and provide evidence that the HLS pipeline worked historically.
- README claims do not completely match current behavior.
- the working `src/` architecture is/was uncommitted while the repository's committed state is older.

Do not blindly fix these one-by-one.

First understand the system as a whole.

---

# 2. Critical Historical Context: `src/config/constants.js`

The previous development session appears to have been focused on assembling:

`src/config/constants.js`

This is important.

The `RS_CONFIG` / resource configuration system appears to be central to the Generation-2 extraction architecture.

Do not casually throw this away.

First determine:

1. what `RS_CONFIG` represents,
2. what data shapes it describes,
3. which Pinterest endpoints/resources it corresponds to,
4. how extractor functions consume it,
5. how state is passed between extractor functions,
6. which entries are currently valid,
7. which entries are stale/broken,
8. which entries are dead,
9. which entries were intended for boards/feed/sections,
10. whether the abstraction is worth preserving,
11. whether it should be redesigned into a more professional equivalent.

Preserve the useful intent even if the implementation itself needs reconstruction.

---

# 3. Overall Mission

Take the repository through all of the following phases.

Do not wait for user approval between phases.

You may reorder internal work when necessary.

You may revisit earlier phases when new evidence invalidates an earlier assumption.

You may redesign the architecture substantially.

You may create, rename, move, split, merge, or delete source files when justified.

You may create tests, fixtures, scripts, documentation, development tooling, and internal utilities.

You may remove legacy implementation after proving the replacement works.

You may commit changes locally whenever useful.

**Do not push anything to any remote.**

The remote has intentionally been disabled.

Local commits are explicitly allowed and encouraged when they create useful recovery/checkpoints.

---

# PHASE 1 — RECOVER THE REAL SYSTEM

Goal:

Understand what this project actually is before changing it.

Do not assume the README, file names, comments, or intended architecture are correct.

Use:

- source code
- package.json
- git history
- git status
- existing audit reports
- captured JSON
- tests
- historical artifacts
- runtime behavior
- actual Pinterest responses where possible

Trace real execution.

Determine:

### Application

- actual entry points
- CLI lifecycle
- argument parsing
- configuration initialization
- orchestration
- extraction
- normalization
- media selection
- downloading
- HLS processing
- metadata
- caching
- output naming
- error propagation
- cleanup
- exit codes

### Pinterest interaction

Determine the actual network model.

Identify:

- HTML requests
- Pinterest resource endpoints
- request parameters
- headers
- response shapes
- image URL extraction
- video URL extraction
- HLS extraction
- board resources
- section resources
- pagination
- pin parsing
- username/profile parsing
- short URL behavior

Do not assume old endpoints still work.

Where possible, perform controlled live verification.

### Architecture recovery

Determine what Generation 2 was trying to become.

Especially investigate:

`src/config/constants.js`

and the complete `RS_CONFIG` flow.

Determine whether the existing design is:

- worth preserving,
- worth adapting,
- or worth replacing.

Do not preserve bad architecture merely because it already exists.

### Git archaeology

Inspect history to understand:

- what was last working,
- what changed during migration,
- where the architecture split happened,
- whether commits explain unfinished code,
- whether files were accidentally left untracked,
- whether old code contains behavior that was lost during migration.

Do not reset or destroy useful work.

At the end of this phase, create:

`reports/01-reconstruction.md`

Include:

- recovered architecture
- confirmed behavior
- historical behavior
- known broken behavior
- unknown behavior
- important discoveries
- architectural interpretation
- recommended direction

---

# PHASE 2 — RECONSTRUCT THE ARCHITECTURE

Goal:

Create a clean, professional architecture for the actual application.

You are explicitly authorized to reconstruct the architecture.

The final architecture should prioritize:

- clear boundaries
- low coupling
- high cohesion
- testability
- maintainability
- explicit dependencies
- predictable data flow
- replaceable Pinterest extraction logic
- replaceable media transport
- robust error handling
- clean CLI/application separation
- future extension without another large rewrite

Avoid architecture for architecture's sake.

Do not create dozens of meaningless abstractions.

Prefer simple domain-oriented modules with explicit responsibilities.

A reasonable conceptual architecture may resemble:

```text
CLI
 │
 ▼
Application / Use Cases
 │
 ├── Pinterest Acquisition
 │    ├── Pin
 │    ├── User
 │    ├── Board
 │    └── Section
 │
 ├── Media Selection
 │
 ├── Media Download
 │
 ├── HLS Processing
 │
 ├── Metadata
 │
 └── Storage
```

But this is only a conceptual direction.

**You are free to choose a better architecture if repository evidence supports it.**

Important:

Do not blindly keep:

```text
lib/
src/
```

as two competing implementations.

The final project should have **one clearly defined active implementation**.

If legacy code is retained temporarily, isolate it clearly.

Do not allow legacy and active implementations to become permanently mixed.

---

## Configuration Reconstruction

Rebuild configuration so that:

- runtime configuration is explicit
- defaults are centralized
- endpoint/resource definitions are understandable
- environment/configuration concerns are separated
- resource extraction definitions are maintainable
- magic strings are minimized
- invalid configuration fails clearly

Preserve the useful intent of `RS_CONFIG`.

If necessary, replace it with a cleaner resource registry/schema.

Document the decision.

---

## Data Model

Define clear internal models for concepts such as:

- Pin
- Media
- Image
- Video
- HLS stream
- Board
- Section
- User/Profile
- Download result
- Extraction result
- Metadata

Do not allow arbitrary Pinterest response JSON to leak throughout the application.

External response formats should be converted into stable internal representations.

---

## Report

Create:

`reports/02-architecture-reconstruction.md`

Document:

- old architecture
- problems
- new architecture
- module responsibilities
- dependency direction
- data flow
- configuration model
- major decisions
- rejected approaches
- migration strategy

---

# PHASE 3 — RESTORE AND IMPLEMENT FUNCTIONALITY

Now implement the actual application.

Do not merely make tests green.

The application must perform real work.

Restore or implement the important user-facing capabilities supported by the project.

At minimum investigate and implement as appropriate:

- single Pin download
- image download
- video download
- HLS video download/conversion
- user/profile feed download
- pagination
- board discovery/download
- board section handling where supported
- metadata
- cache
- overwrite behavior
- organized output
- verbose logging
- progress reporting
- graceful interruption
- meaningful CLI errors

Preserve compatible CLI behavior when practical.

If the existing CLI design is confusing or fundamentally broken, improve it and document the change.

---

## Pagination

Fix the known problem where:

`--pages`

does not actually control pagination.

Define explicit semantics.

For example:

```text
--pages 1
--pages 5
--pages all
```

or another sensible design.

Do not silently create unbounded requests.

Make pagination behavior testable.

---

## Pin Resolution

Support appropriate Pinterest URL forms.

Investigate:

- normal Pin URLs
- Pin IDs
- `pin.it` URLs
- relevant URL redirects

Do not claim support unless verified.

---

## Board / Section

Finish the board architecture if Pinterest data still supports it.

Do not hardcode captured fixture data into production execution.

Historical JSON captures may be used as fixtures/tests, not as runtime dependencies.

---

## Extraction

Build extraction around stable internal models.

Pinterest-specific response parsing should be isolated.

If Pinterest changes response structures, ideally only the relevant extraction layer should need modification.

---

## Media Selection

Implement deterministic media selection.

For images:

- prefer appropriate highest-quality source available.

For videos:

- select the best available representation according to actual source data.

Do not claim a specific resolution such as 720p unless the application can actually guarantee it.

---

# PHASE 4 — HARDEN DOWNLOADS, HLS, STORAGE & RELIABILITY

This phase is about making the downloader trustworthy.

A file existing on disk does **not** mean a successful download.

Implement proper download verification.

At minimum consider:

1. HTTP status
2. response headers
3. content type
4. expected media type
5. non-zero size
6. partial download detection
7. HTML/error-page detection
8. file signature / magic bytes where appropriate
9. media probing where practical
10. HLS output validation
11. atomic write / temporary file handling
12. cleanup after failed downloads

A failed download should not masquerade as success.

Avoid corrupt final files.

A robust pattern may be:

```text
download
   ↓
temporary file
   ↓
validate
   ↓
atomic rename
```

If validation fails:

```text
temporary file
   ↓
cleanup
   ↓
failure result
```

---

## Deduplication

Do not reduce deduplication to:

```text
if file exists:
    skip
```

Determine whether an existing file is actually usable.

Consider:

- existence
- file size
- content signature
- media validity
- metadata identity
- hashes where useful

Do not over-engineer hashing if cheaper validation is sufficient.

---

## HLS

Audit and harden:

- master playlist parsing
- variant selection
- audio selection
- audio group normalization
- ffmpeg invocation
- temporary files
- conversion errors
- output validation
- cleanup
- missing audio
- unsupported playlists
- process interruption

Do not silently return a broken MP4.

Use the historical HLS artifacts as useful fixtures/evidence where appropriate.

---

## Reliability

Implement sensible:

- timeouts
- retries
- backoff
- error classification
- retry limits
- network error handling
- HTTP error handling
- filesystem error handling
- ffmpeg error handling

Do not retry permanent errors indefinitely.

---

## Report

Create:

`reports/03-reliability-hardening.md`

Include:

- download lifecycle
- validation strategy
- retry strategy
- error taxonomy
- HLS strategy
- storage strategy
- corruption prevention
- decisions and tradeoffs

---

# PHASE 5 — BUILD A REAL TESTING SYSTEM

The current tests are known to target an obsolete/phantom architecture.

Do not merely patch imports until they pass.

Reconstruct the testing strategy around the final architecture.

Use multiple levels.

---

## Unit Tests

Test pure logic such as:

- URL parsing
- Pin ID extraction
- username normalization
- media selection
- image extraction
- video extraction
- HLS selection
- configuration
- naming
- metadata
- pagination
- error classification
- validation
- CLI parsing

---

## Fixture / Integration Tests

Use captured Pinterest JSON/HTML where appropriate.

Create proper fixtures.

Do not make production code depend on fixtures.

Test:

```text
Pinterest response
        ↓
parser
        ↓
normalized model
        ↓
media selection
```

Include malformed and unexpected responses.

---

## Downloader Tests

Test:

- successful image
- successful video
- invalid content type
- HTML instead of media
- empty response
- truncated file
- retry
- timeout
- HTTP failure
- overwrite
- existing valid file
- existing corrupt file
- cleanup
- interruption

---

## HLS Tests

Test historical fixtures and synthetic/minimal cases where practical.

Test:

- master playlist
- variant selection
- audio selection
- malformed playlist
- ffmpeg failure
- conversion success
- output validation
- cleanup

---

## Live Tests

Where network access is available, perform real Pinterest tests.

Do not rely exclusively on mocks.

Live tests should verify actual current behavior for representative cases.

Avoid excessive requests.

Use a controlled test matrix.

Examples:

```text
single public pin image
single public pin video
public profile with pagination
public board
pin.it URL
HLS video
```

Only test capabilities that Pinterest currently exposes.

---

## User Acceptance Test

Treat:

`pinterest-downloader-output/`

as real-world acceptance evidence.

Inspect actual downloaded files if present.

Verify:

- filenames
- directory structure
- file sizes
- media validity
- image readability
- video playability/probing
- metadata
- duplicates
- corrupt files
- unexpected HTML
- incomplete downloads

The goal is not merely:

```text
exit code = 0
```

The goal is:

```text
the downloaded artifact is actually usable
```

---

## Test Infrastructure

Make tests easy to run.

Provide sensible npm scripts, for example:

```text
npm test
npm run test:unit
npm run test:integration
npm run test:live
```

Use the actual naming that fits the final project.

Do not introduce scripts that don't work.

---

## Report

Create:

`reports/04-testing-qa.md`

Include:

- old test problems
- final test architecture
- test categories
- coverage of major features
- live verification results
- known unverified behavior
- UAT results

---

# PHASE 6 — CLEANUP, MIGRATION, DOCUMENTATION & RELEASE ENGINEERING

Once the new implementation is proven, clean the repository.

Do not delete legacy code prematurely.

The order matters.

First:

```text
implement
→ test
→ integration test
→ live test
→ UAT
→ compare behavior
→ migrate
→ remove legacy
```

Only remove old implementation when there is enough evidence that it is no longer needed.

---

## Legacy

Determine the final fate of:

```text
lib/
main.js
cli.js
test.js
test.py
trash/
```

Possible outcomes:

- delete
- archive
- convert to fixtures
- retain as documentation
- retain temporarily

Make the decision based on evidence.

Do not preserve legacy code merely because it once worked.

Do not delete historically useful fixtures blindly.

---

## Root Artifacts

Classify artifacts such as:

```text
board.json
board_section.json
board_section_content.json
board_user_content.json
compare.txt
error.txt
kysma.json
wendi.json
wendi2.json
```

Determine which are:

- useful fixtures
- research artifacts
- sensitive data
- temporary experiments
- obsolete files

Remove sensitive information from the repository.

In particular, investigate `error.txt` because it reportedly contains external email addresses and a GCP project ID.

Do not propagate secrets or personal data into the final project.

---

## Git

Keep the repository recoverable.

Make local commits at meaningful milestones.

Example:

```text
chore: preserve legacy baseline
refactor: establish application architecture
feat: restore pin extraction
feat: restore feed pagination
feat: implement board extraction
fix: harden media validation
test: add extraction fixtures
test: add downloader integration tests
test: add live verification
docs: update usage documentation
chore: remove obsolete legacy implementation
```

Commit messages do not have to use these exact names.

**Never push.**

Do not add or configure a remote.

---

## Package Metadata

Ensure:

- `package.json`
- `main`
- `bin`
- scripts
- dependencies
- Node version requirements
- lockfile

all correspond to the final implementation.

The repository must work from a clean clone.

A fresh clone should not depend on uncommitted local files.

---

## README

Rewrite the README for ordinary users.

The README should explain:

- what the tool does
- requirements
- installation
- basic usage
- downloading a pin
- downloading a user
- downloading boards if supported
- images/videos
- pagination
- metadata
- cache
- overwrite
- verbose mode
- output structure
- troubleshooting
- limitations
- supported URL forms
- HLS/ffmpeg requirements if applicable
- development/testing
- live test requirements

Do not document functionality that is not actually implemented.

Do not promise resolution guarantees that cannot be guaranteed.

---

## Documentation

Create/update documentation when useful.

Prefer concise documentation over documentation spam.

The repository should explain architecture sufficiently for another developer to maintain it.

---

## Report

Create:

`reports/05-cleanup-release.md`

Include:

- legacy decisions
- files removed
- files retained
- repository cleanup
- dependency cleanup
- package configuration
- README changes
- clean-clone verification
- release readiness

---

# PHASE 7 — FINAL VERIFICATION & COMPLETION

This is the final gate.

Do not declare completion merely because implementation work appears finished.

Perform a full verification pass.

---

## Static Verification

Check:

- broken imports
- unused modules
- dead paths
- circular dependencies
- unreachable code
- invalid configuration
- stale comments
- stale README claims
- phantom test architecture
- accidental debug code
- accidental secrets
- accidental credentials
- hardcoded local paths
- hardcoded fixture dependencies

---

## Runtime Verification

Run:

```text
npm install
npm test
```

plus all appropriate test scripts.

Run CLI help.

Run representative real commands.

Verify exit codes.

Verify errors are understandable.

---

## Live Pinterest Verification

Perform controlled live verification where possible.

Document:

- date/time
- test type
- input
- result
- HTTP/extraction behavior
- media result
- limitations

Do not pretend a live test succeeded if Pinterest blocked, changed, or failed.

Distinguish:

```text
PASS
FAIL
BLOCKED
UNAVAILABLE
UNVERIFIED
```

---

## Output Verification

Inspect actual:

`pinterest-downloader-output/`

if available.

Verify actual artifacts.

For each representative download:

```text
request
↓
extraction
↓
selection
↓
download
↓
validation
↓
storage
↓
final artifact
```

The entire chain must make sense.

---

## Fresh Clone Verification

This is extremely important.

The final repository must be reconstructible from Git.

Simulate or perform a clean environment:

```text
git clone
npm install
npm test
CLI execution
```

Ensure no functionality depends on ignored/untracked local files.

---

## Final Architecture Review

Ask yourself:

> If I returned to this repository six months from now, would I understand where Pinterest extraction, media selection, downloading, storage, and CLI behavior live?

If the answer is no, improve the structure before finishing.

Ask:

> If Pinterest changes one response shape, can I reasonably modify the extraction layer without rewriting the entire application?

If not, improve the boundaries.

Ask:

> Can another developer add another media source/backend without creating another generation of spaghetti?

If not, improve the architecture.

---

# REPORTING REQUIREMENTS

All important work must be documented under:

```text
reports/
```

Do not create endless audit reports.

Reports should be **execution reports**, not paperwork for its own sake.

A report may contain:

- what was investigated
- what was discovered
- what was changed
- why it was changed
- what was removed
- what remains
- tests performed
- test results
- live verification
- decisions made
- assumptions
- unresolved limitations
- architectural decisions
- migration notes
- commit references

Recommended structure:

```text
reports/
├── 01-reconstruction.md
├── 02-architecture-reconstruction.md
├── 03-reliability-hardening.md
├── 04-testing-qa.md
├── 05-cleanup-release.md
└── final-report.md
```

You may add additional reports if genuinely useful.

Do not create reports simply to increase the report count.

---

# DECISION AUTHORITY

You have explicit authority to make decisions.

Do not repeatedly ask:

> Should I use architecture A or B?

Choose based on:

1. repository evidence
2. current behavior
3. maintainability
4. testability
5. simplicity
6. future extensibility
7. established engineering practice

Document important decisions.

If multiple approaches are reasonable, choose one.

You do not need user approval.

---

# IMPORTANT: DO NOT PRESERVE BROKEN ARCHITECTURE FOR SENTIMENTAL REASONS

The existence of `src/` does not mean `src/` must remain exactly as-is.

The existence of `lib/` does not mean `lib/` must remain.

The existence of `RS_CONFIG` does not mean the current implementation of `RS_CONFIG` is correct.

The existence of tests does not mean the current tests represent the intended final architecture.

The goal is:

**recover intent → verify behavior → reconstruct architecture → implement → test → validate → clean up → document**

not:

**patch every existing file until the repository stops throwing errors.**

---

# SAFETY / DATA HANDLING

Never commit:

- passwords
- cookies
- session tokens
- API keys
- credentials
- personal email datasets
- cloud credentials
- private tokens

Inspect historical artifacts before committing them.

Use `.gitignore` appropriately.

Do not expose external personal data merely because it exists in an old artifact.

---

# NETWORK / SCRAPING PRINCIPLES

Pinterest is an external service and may change independently of this project.

Do not assume an old endpoint remains valid.

When possible:

- isolate Pinterest-specific behavior
- use reasonable request rates
- use timeouts
- classify failures
- avoid infinite retries
- avoid unbounded pagination
- make network failures observable
- document current limitations

Do not attempt to hide failures from the user.

---

# COMPLETION CRITERIA

The project is complete when all of the following are reasonably satisfied:

### Architecture

- one clear active implementation
- clean module boundaries
- no accidental Gen1/Gen2 mixture
- Pinterest-specific extraction isolated
- maintainable configuration
- explicit data flow

### Functionality

- supported Pin workflows work
- supported image workflows work
- supported video workflows work
- HLS workflow works where applicable
- feed/profile workflow works
- pagination works
- board workflow works if still supported
- metadata/cache behavior is coherent
- CLI behavior is coherent

### Reliability

- failed downloads cannot silently become successful files
- corrupt/HTML downloads are detected
- partial files are cleaned up
- retries are bounded
- timeouts exist
- HLS failures are detected
- graceful interruption works

### Testing

- unit tests
- fixture/integration tests
- downloader tests
- HLS tests where applicable
- live tests where possible
- real output/UAT verification

### Repository

- no accidental secrets
- no unnecessary sensitive artifacts
- package metadata works
- clean clone works
- tests work from clean install
- legacy code has a deliberate final disposition

### Documentation

- README matches actual behavior
- architecture is documented
- limitations are documented
- reports explain important decisions

### Git

- meaningful local commits exist
- working state is recoverable
- no remote push is performed

---

# FINAL REPORT

At the very end, create:

`reports/final-report.md`

It should contain:

## Executive Summary

What happened to the project and what was done.

## Before

Important problems discovered.

## After

Final architecture and functionality.

## Major Changes

List the important implementation changes.

## Legacy Migration

Explain what happened to Gen1 and why.

## Testing

Summarize:

- unit tests
- integration tests
- live tests
- UAT
- clean-clone verification

Use actual numbers/results.

## Current Supported Features

Only list verified capabilities.

## Known Limitations

Clearly identify anything that could not be verified or depends on Pinterest behavior.

## Important Architectural Decisions

Explain the most consequential decisions.

## Git Checkpoints

List important local commits.

## Remaining Work

Only list genuinely remaining work.

If there is no meaningful remaining work, say so.

---

# FINAL INSTRUCTION

Do not stop after producing an audit.

Do not stop after producing a plan.

Do not stop after fixing one obvious bug.

Do not stop because the old architecture is messy.

Do not stop because a decision is ambiguous.

**Continue executing the mission.**

Reason deeply.

Inspect the repository.

Run the code.

Modify the code.

Build the architecture.

Write tests.

Run tests.

Perform live verification where possible.

Inspect real output.

Clean the repository.

Update documentation.

Commit meaningful milestones.

Then perform a final verification pass.

You have authority to reconstruct the architecture and make engineering decisions autonomously.

**The desired outcome is a finished, professional, maintainable `pinterest-js` project — not another pile of audit reports.**
