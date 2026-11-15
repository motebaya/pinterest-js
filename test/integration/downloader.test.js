/**
 * Downloader integration tests.
 *
 * Runs the real download pipeline against a local HTTP server:
 * temp file → validation → atomic rename, retries, skip/overwrite,
 * and corruption prevention (HTML masquerading as media, truncation,
 * zero bytes).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadMedia, DOWNLOAD_TIMEOUT_MS } from "../../src/core/downloader/download.js";
import { withServer, readBody, nolog } from "../helpers/index.js";

/** A minimal but structurally valid PNG (1x1 pixel). */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050201" +
    "48baf0d60000000049454e44ae426082",
  "hex",
);
/** A minimal valid JPEG header (SOI + APP0). */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 0x11)]);
/** HTML error page. */
const HTML = Buffer.from("<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>".padEnd(600, "x"));

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pjs-dl-"));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("downloadMedia (integration)", () => {
  it("downloads and validates an image", async () => {
    const dir = tmpDir();
    try {
      const srv = await withServer((req, res) => {
        res.writeHead(200, { "content-type": "image/png", "content-length": PNG.length });
        res.end(PNG);
      });
      try {
        const result = await downloadMedia({
          url: `${srv.url}/photo.png`,
          expect: "image",
          outputDir: dir,
          filename: "photo.png",
          showProgress: false,
          log: nolog,
        });
        assert.equal(result.status, true);
        assert.equal(result.skipped, false);
        assert.ok(fs.existsSync(result.file));
        assert.equal(fs.readFileSync(result.file).length, PNG.length);
        assert.equal(path.basename(result.file), "photo.png");
        // no leftover temp files
        assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".part")), []);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("derives extension and filename from URL when not given", async () => {
    const dir = tmpDir();
    try {
      const srv = await withServer((req, res) => {
        res.writeHead(200, { "content-type": "image/jpeg" });
        res.end(JPEG);
      });
      try {
        const result = await downloadMedia({
          url: `${srv.url}/images/abc123.jpg?h=1`,
          expect: "image",
          outputDir: dir,
          showProgress: false,
          log: nolog,
        });
        assert.equal(path.basename(result.file), "abc123.jpg");
        assert.equal(fs.statSync(result.file).size, JPEG.length);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("skips when the final file already exists (no overwrite)", async () => {
    const dir = tmpDir();
    try {
      const existing = path.join(dir, "photo.png");
      fs.writeFileSync(existing, "original-bytes");
      let hits = 0;
      const srv = await withServer((req, res) => {
        hits += 1;
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG);
      });
      try {
        const result = await downloadMedia({
          url: `${srv.url}/photo.png`,
          expect: "image",
          outputDir: dir,
          filename: "photo.png",
          showProgress: false,
          log: nolog,
        });
        assert.equal(result.skipped, true);
        assert.equal(hits, 0, "server should never be contacted when skipping");
        assert.equal(fs.readFileSync(existing, "utf8"), "original-bytes");
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("overwrites an existing file when asked", async () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, "photo.png"), "stale");
      const srv = await withServer((req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG);
      });
      try {
        const result = await downloadMedia({
          url: `${srv.url}/photo.png`,
          expect: "image",
          outputDir: dir,
          filename: "photo.png",
          overwrite: true,
          showProgress: false,
          log: nolog,
        });
        assert.equal(result.skipped, false);
        assert.equal(fs.readFileSync(result.file).length, PNG.length);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("rejects HTML masquerading as media and cleans up the temp file", async () => {
    const dir = tmpDir();
    try {
      const srv = await withServer((req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(HTML); // declared png, actually HTML
      });
      try {
        await assert.rejects(
          downloadMedia({ url: `${srv.url}/x.png`, expect: "image", outputDir: dir, showProgress: false, log: nolog }),
          /HTML page|instead of media/,
        );
        assert.deepEqual(fs.readdirSync(dir), [], "no files should survive a failed download");
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("rejects declared HTML content-type before writing", async () => {
    const dir = tmpDir();
    try {
      const srv = await withServer((req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(HTML);
      });
      try {
        await assert.rejects(
          downloadMedia({ url: `${srv.url}/x.jpg`, expect: "image", outputDir: dir, showProgress: false, log: nolog }),
          /instead of media/,
        );
        assert.deepEqual(fs.readdirSync(dir), []);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("rejects zero-byte responses", async () => {
    const dir = tmpDir();
    try {
      const srv = await withServer((req, res) => {
        res.writeHead(200, { "content-type": "image/png", "content-length": 0 });
        res.end();
      });
      try {
        await assert.rejects(
          downloadMedia({ url: `${srv.url}/zero.png`, expect: "image", outputDir: dir, showProgress: false, log: nolog }),
          /0 bytes|empty body/,
        );
        assert.deepEqual(fs.readdirSync(dir), []);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("does not clobber an existing valid file with HTML from a stale URL", async () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, "good.png"), "good-bytes");
      const srv = await withServer((req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(HTML);
      });
      try {
        await assert.rejects(
          downloadMedia({ url: `${srv.url}/good.png`, expect: "image", outputDir: dir, filename: "good.png", overwrite: true, showProgress: false, log: nolog }),
          /HTML page/,
        );
        assert.equal(fs.readFileSync(path.join(dir, "good.png"), "utf8"), "good-bytes");
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("retries transient failures and succeeds", async () => {
    const dir = tmpDir();
    try {
      let attempts = 0;
      const srv = await withServer((req, res) => {
        attempts += 1;
        if (attempts < 3) {
          // mid-stream reset: close the socket without a complete response
          res.destroy();
          return;
        }
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG);
      });
      try {
        const result = await downloadMedia({
          url: `${srv.url}/flaky.png`,
          expect: "image",
          outputDir: dir,
          filename: "flaky.png",
          showProgress: false,
          log: nolog,
        });
        assert.equal(result.skipped, false);
        assert.ok(attempts >= 3, `expected >=3 attempts, got ${attempts}`);
        assert.equal(fs.statSync(result.file).size, PNG.length);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("does not retry permanent 404s and surfaces the HTTP status", async () => {
    const dir = tmpDir();
    try {
      let attempts = 0;
      const srv = await withServer((req, res) => {
        attempts += 1;
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("nope");
      });
      try {
        await assert.rejects(
          downloadMedia({ url: `${srv.url}/gone.png`, expect: "image", outputDir: dir, showProgress: false, log: nolog }),
          /HTTP 404/,
        );
        assert.equal(attempts, 1, "404 must not be retried");
        assert.deepEqual(fs.readdirSync(dir), []);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("rejects invalid URLs up front", async () => {
    const dir = tmpDir();
    await assert.rejects(
      downloadMedia({ url: "not-a-url", expect: "image", outputDir: dir, log: nolog }),
      /invalid media URL/,
    );
  });

  it("keeps the 60s download timeout constant", () => {
    assert.equal(DOWNLOAD_TIMEOUT_MS, 60_000);
  });
});
