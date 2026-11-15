import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getOutputDir,
  setOutputDir,
  outputDirSource,
  OUTPUT_DIR_NAME,
} from "../../src/config/paths.js";

const ENV_VAR = "PINTEREST_JS_OUTPUT_DIR";

/** Temp dir that exists for the whole test (fs APIs on win32 need a real base). */
function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pjs-paths-"));
}

describe("output root resolution", () => {
  let tmp;
  const savedEnv = process.env[ENV_VAR];

  beforeEach(() => {
    tmp = makeTempRoot();
    delete process.env[ENV_VAR];
    setOutputDir(undefined); // clear CLI override
  });

  afterEach(() => {
    setOutputDir(undefined);
    if (savedEnv === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = savedEnv;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("defaults to <project root>/pinterest-downloader-output", () => {
    const dir = getOutputDir();
    assert.equal(outputDirSource(), "default");
    assert.equal(path.basename(dir), OUTPUT_DIR_NAME);
  });

  it("honors the PINTEREST_JS_OUTPUT_DIR env var", () => {
    process.env[ENV_VAR] = path.join(tmp, "custom-env-root");
    const dir = getOutputDir();
    assert.equal(outputDirSource(), "env");
    assert.equal(dir, path.resolve(path.join(tmp, "custom-env-root")));
    assert.ok(fs.existsSync(dir), "env override dir is created");
  });

  it("CLI override wins over the env var", () => {
    process.env[ENV_VAR] = path.join(tmp, "from-env");
    const cliDir = path.join(tmp, "from-cli");
    setOutputDir(cliDir);
    const dir = getOutputDir();
    assert.equal(outputDirSource(), "cli");
    assert.equal(dir, path.resolve(cliDir));
  });

  it("creates the CLI override directory on first use", () => {
    const cliDir = path.join(tmp, "nested", "out");
    setOutputDir(cliDir);
    const dir = getOutputDir();
    assert.equal(dir, path.resolve(cliDir));
    assert.ok(fs.existsSync(dir), "nested override dir is created");
  });

  it("clearing the override falls back to env/default", () => {
    process.env[ENV_VAR] = path.join(tmp, "from-env");
    setOutputDir(path.join(tmp, "from-cli"));
    setOutputDir(undefined);
    assert.equal(outputDirSource(), "env");

    delete process.env[ENV_VAR];
    assert.equal(outputDirSource(), "default");
  });

  it("treats a blank override as no override", () => {
    setOutputDir("   ");
    assert.equal(outputDirSource(), "default");
  });
});
