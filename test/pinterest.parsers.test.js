/**
 * Smoke tests for Pinterest parsers and extractors
 * No network calls - tests module loading and basic structure only.
 */

import assert from "node:assert";
import { createPinterestExtractor, Pinterest } from "../src/core/extractors/pinterest/index.js";
import PinterestClient from "../src/core/extractors/pinterest/PinterestClient.js";
import { parsePin } from "../src/core/extractors/pinterest/parsers/pin.js";
import { parseUser } from "../src/core/extractors/pinterest/parsers/user.js";
import { parseBoard } from "../src/core/extractors/pinterest/parsers/board.js";
import endpoints from "../src/core/extractors/pinterest/endpoints.js";
import Helper from "../src/utils/Helper.js";
import Utils from "../src/utils/Utils.js";

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

console.log("\n--- Pinterest Parsers & Extractors Smoke Tests ---\n");

test("Pinterest class can be imported", () => {
  assert.ok(Pinterest);
  assert.strictEqual(typeof Pinterest, "function");
});

test("createPinterestExtractor returns a Pinterest instance", () => {
  const ext = createPinterestExtractor();
  assert.ok(ext instanceof Pinterest);
});

test("PinterestClient wraps Pinterest correctly", () => {
  const client = new PinterestClient();
  assert.strictEqual(typeof client.getConfigInfo, "function");
  assert.strictEqual(typeof client.getUserPins, "function");
  assert.strictEqual(typeof client.getImages, "function");
  assert.strictEqual(typeof client.getVideos, "function");
  assert.strictEqual(typeof client.getUserBoards, "function");
  assert.ok(client.log);
});

test("parsePin is a pass-through function", () => {
  const data = { id: "123" };
  assert.deepStrictEqual(parsePin(data), data);
});

test("parseUser is a pass-through function", () => {
  const data = { username: "test" };
  assert.deepStrictEqual(parseUser(data), data);
});

test("parseBoard is a pass-through function", () => {
  const data = { name: "test board" };
  assert.deepStrictEqual(parseBoard(data), data);
});

test("endpoints re-exports Helper.URL", () => {
  assert.ok(endpoints.URL);
  assert.strictEqual(endpoints.URL.host, Helper.URL.host);
  assert.strictEqual(endpoints.URL.shortHost, Helper.URL.shortHost);
});

test("endpoints re-exports Helper.REGEX", () => {
  assert.ok(endpoints.REGEX);
  assert.ok(endpoints.REGEX.pinUrl instanceof RegExp);
});

test("Utils.isPinUrl validates pin URLs", () => {
  const result = Utils.isPinUrl("1234567890123456");
  assert.ok(result);
  assert.strictEqual(result.format, "id");
  assert.strictEqual(result.id, "1234567890123456");
});

test("Utils.isPinUrl rejects invalid input", () => {
  const result = Utils.isPinUrl("not-a-pin");
  assert.strictEqual(result, false);
});

test("Utils.getTraceId returns hex string", () => {
  const id = Utils.getTraceId();
  assert.strictEqual(typeof id, "string");
  assert.ok(id.length >= 1);
  assert.ok(/^[0-9a-f]+$/.test(id));
});

test("Utils.getDefaultPath returns a path containing pinterest-downloader-output", () => {
  const p = Utils.getDefaultPath();
  assert.ok(p.includes("pinterest-downloader-output"));
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
