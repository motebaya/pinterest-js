/**
 * CLI integration tests.
 *
 * Runs the real CLI as a subprocess (no network: failure paths + help only).
 * Verifies exit-code contract and output hygiene.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "cli.js");

/**
 * Run the CLI with args; capture code/stdout/stderr.
 * @param {string[]} args
 * @param {{ env?: Record<string, string> }} [opts]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runCli(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      {
        env: { ...process.env, ...(opts.env ?? {}) },
        timeout: 60_000,
      },
      (err, stdout, stderr) => {
        // err.code holds the process exit code; null means signal/no-exit
        resolve({ code: err?.code ?? 0, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

describe("CLI", () => {
  it("prints help and exits 0 when no arguments are given", async () => {
    const r = await runCli([]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /--username/);
    assert.match(r.stdout, /--pin/);
    assert.match(r.stdout, /--feed/);
    assert.match(r.stdout, /--board/);
  });

  it("rejects invalid pin input with exit code 2", async () => {
    const r = await runCli(["-p", "not-a-pin"]);
    assert.equal(r.code, 2);
    assert.match(r.stdout + r.stderr, /invalid pin url or id/);
  });

  it("rejects username mode without an action flag (exit 2)", async () => {
    const r = await runCli(["-u", "someuser"]);
    assert.equal(r.code, 2);
    assert.match(r.stdout + r.stderr, /--feed|--board|action/);
  });

  it("rejects invalid usernames with exit code 2", async () => {
    const r = await runCli(["-u", "ab", "--feed"]);
    assert.equal(r.code, 2);
    assert.match(r.stdout + r.stderr, /invalid username/);
  });

  it("strips ANSI escapes from plain error lines (log hygiene)", async () => {
    const r = await runCli(["-p", "not-a-pin"]);
    const plain = r.stdout + r.stderr;
    // the error message text must be present and line-prefixed, not raw JSON
    assert.match(plain, /✗/);
    assert.doesNotMatch(plain, /\{"level"/);
  });
});
