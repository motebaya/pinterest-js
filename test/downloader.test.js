/**
 * Smoke tests for Downloader and related modules
 * No network calls - tests module loading and basic structure only.
 */

import assert from "node:assert";
import Downloader from "../src/core/downloader/Downloader.js";
import DownloadManager from "../src/core/downloader/DownloadManager.js";
import FileWriter from "../src/core/downloader/FileWriter.js";
import RetryPolicy from "../src/core/downloader/RetryPolicy.js";
import HLS from "../src/core/extractors/hls/HLS.js";
import HlsResolver from "../src/core/extractors/hls/HlsResolver.js";
import HlsDownloader from "../src/core/extractors/hls/HlsDownloader.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL: ${name} - ${e.message}`);
    failed++;
  }
}

console.log("\n--- Downloader & HLS Smoke Tests ---\n");

test("Downloader class can be imported", () => {
  assert.ok(Downloader);
  assert.strictEqual(typeof Downloader._download, "function");
  assert.strictEqual(typeof Downloader.humanSize, "function");
});

test("Downloader.humanSize formats bytes correctly", () => {
  assert.strictEqual(Downloader.humanSize(0), "0 B");
  assert.strictEqual(Downloader.humanSize(1024), "1 kB");
  assert.strictEqual(Downloader.humanSize(1048576), "1 MB");
});

test("DownloadManager wraps Downloader", () => {
  assert.strictEqual(typeof DownloadManager.download, "function");
  assert.strictEqual(typeof DownloadManager.humanSize, "function");
  assert.strictEqual(DownloadManager.humanSize(1024), "1 kB");
});

test("FileWriter can be instantiated", () => {
  const fw = new FileWriter("/tmp/test.txt", { overwrite: true });
  assert.strictEqual(fw.filePath, "/tmp/test.txt");
  assert.strictEqual(fw.overwrite, true);
});

test("RetryPolicy can be instantiated with defaults", () => {
  const rp = new RetryPolicy();
  assert.strictEqual(rp.maxRetries, 3);
  assert.strictEqual(rp.delayMs, 1000);
});

test("RetryPolicy accepts custom options", () => {
  const rp = new RetryPolicy({ maxRetries: 5, delayMs: 2000 });
  assert.strictEqual(rp.maxRetries, 5);
  assert.strictEqual(rp.delayMs, 2000);
});

test("HLS class can be imported", () => {
  assert.ok(HLS);
  assert.strictEqual(typeof HLS.convert, "function");
  assert.strictEqual(typeof HLS.setLogger, "function");
  assert.strictEqual(typeof HLS.getBestVariant, "function");
  assert.strictEqual(typeof HLS.getBestAudio, "function");
});

test("HlsResolver wraps HLS resolution methods", () => {
  assert.strictEqual(typeof HlsResolver.getBestVariant, "function");
  assert.strictEqual(typeof HlsResolver.getBestAudio, "function");
  assert.strictEqual(typeof HlsResolver.setLogger, "function");
});

test("HlsDownloader wraps HLS conversion methods", () => {
  assert.strictEqual(typeof HlsDownloader.convert, "function");
  assert.strictEqual(typeof HlsDownloader.convertToMp4, "function");
  assert.strictEqual(typeof HlsDownloader.setLogger, "function");
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
