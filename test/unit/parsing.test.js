import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePinInput, parseUsername, resourceUrl, pinUrl, profileUrl, RELAY_JSON } from "../../src/config/urls.js";
import { getTraceId } from "../../src/util/trace.js";
import { humanSize, toTitleCase } from "../../src/util/format.js";
import { sanitizeFilename, atomicMove, removeFile, ensureDir } from "../../src/util/fs.js";
import { AppError, asAppError, ERROR_CODES } from "../../src/util/errors.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("parsePinInput", () => {
  it("parses bare numeric id", () => {
    const r = parsePinInput("1234567890123456");
    assert.equal(r.format, "id");
    assert.equal(r.id, "1234567890123456");
    assert.equal(r.url, pinUrl("1234567890123456"));
  });
  it("parses long URL", () => {
    const r = parsePinInput("https://www.pinterest.com/pin/123456789012345678/");
    assert.equal(r.format, "long");
    assert.equal(r.id, "123456789012345678");
  });
  it("parses long URL without trailing slash and country tld", () => {
    const r = parsePinInput("https://id.pinterest.com/pin/996773330040411806");
    assert.equal(r.format, "long");
    assert.equal(r.id, "996773330040411806");
  });
  it("parses pin.it short link", () => {
    const r = parsePinInput("https://pin.it/abc123XYZ");
    assert.equal(r.format, "short");
    assert.equal(r.id, "abc123XYZ");
  });
  it("rejects non-pin input", () => {
    assert.equal(parsePinInput("https://v1.pinimg.com/"), null);
    assert.equal(parsePinInput("hello"), null);
    assert.equal(parsePinInput(""), null);
    assert.equal(parsePinInput(undefined), null);
  });
  it("rejects too-short numeric ids", () => {
    assert.equal(parsePinInput("12345"), null);
  });
});

describe("parseUsername", () => {
  it("accepts plain and @-prefixed usernames", () => {
    assert.equal(parseUsername("seihin_"), "seihin_");
    assert.equal(parseUsername("@seihin_"), "seihin_");
  });
  it("rejects invalid usernames", () => {
    assert.equal(parseUsername("ab"), null);
    assert.equal(parseUsername("has space"), null);
    assert.equal(parseUsername(""), null);
    assert.equal(parseUsername(undefined), null);
  });
});

describe("url builders", () => {
  it("builds resource urls with encoded data", () => {
    const url = resourceUrl({ resource: "UserActivityPinsResource", sourceUrl: "/x/", data: { options: {} } });
    assert.ok(url.startsWith("https://id.pinterest.com/resource/UserActivityPinsResource/get/"));
    assert.ok(url.includes("source_url=%2Fx%2F"));
    assert.ok(url.includes("data=%7B%22options%22"));
  });
  it("builds profile urls", () => {
    assert.equal(profileUrl("user"), "https://id.pinterest.com/user/");
  });
});

describe("trace ids", () => {
  it("generates 16-char hex strings", () => {
    const id = getTraceId();
    assert.equal(id.length, 16);
    assert.match(id, /^[0-9a-f]+$/);
    assert.notEqual(getTraceId(), getTraceId());
  });
});

describe("format utils", () => {
  it("formats byte sizes", () => {
    assert.equal(humanSize(0), "0 B");
    assert.equal(humanSize(1024), "1 kB");
    assert.equal(humanSize(1048576), "1 MB");
    assert.equal(humanSize(5 * 1024 * 1024 * 1024), "5 GB");
  });
  it("title-cases", () => {
    assert.equal(toTitleCase("user feed"), "User Feed");
  });
});

describe("fs utils", () => {
  it("sanitizes filenames", () => {
    assert.equal(sanitizeFilename('a<b>c:"d/e\\f|g?h*i'), "abcdefghi");
    assert.equal(sanitizeFilename("x\x00\x1Fy"), "xy");
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pjs-test-"));
  process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));

  it("atomically moves files", () => {
    const src = path.join(tmp, "a.part");
    const dst = path.join(tmp, "sub", "a.final");
    fs.writeFileSync(src, "data");
    atomicMove(src, dst);
    assert.ok(fs.existsSync(dst));
    assert.ok(!fs.existsSync(src));
    assert.equal(fs.readFileSync(dst, "utf8"), "data");
  });

  it("removes files without throwing on missing", () => {
    assert.equal(removeFile(path.join(tmp, "nonexistent")), false);
    const f = path.join(tmp, "temp-delete-me");
    fs.writeFileSync(f, "x");
    assert.equal(removeFile(f), true);
  });

  it("creates directories recursively", () => {
    const deep = path.join(tmp, "x", "y", "z");
    ensureDir(deep);
    assert.ok(fs.statSync(deep).isDirectory());
  });
});

describe("errors", () => {
  it("creates AppError with stable codes", () => {
    const e = new AppError("E_NO_MEDIA");
    assert.equal(e.code, "E_NO_MEDIA");
    assert.equal(e.message, ERROR_CODES.E_NO_MEDIA);
    assert.ok(e instanceof Error);
  });
  it("supports custom messages and causes", () => {
    const cause = new Error("boom");
    const e = new AppError("E_NETWORK", "custom", { cause });
    assert.equal(e.message, "custom");
    assert.equal(e.cause?.message, "boom");
  });
  it("asAppError wraps unknown errors", () => {
    const wrapped = asAppError(new Error("mystery"));
    assert.equal(wrapped.code, "E_NETWORK");
    const timeout = asAppError(Object.assign(new Error("x"), { code: "ECONNABORTED" }));
    assert.equal(timeout.code, "E_TIMEOUT");
  });
});

describe("relay regex", () => {
  it("matches window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__ payloads", () => {
    const html = `<script>window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("abc", {"data":{"k":{"data":{"entityId":"123"}}}});</script>`;
    const rx = new RegExp(RELAY_JSON.source, "g");
    assert.ok(rx.test(html));
  });
});
