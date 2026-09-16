/**
 * HLS integration tests.
 *
 * The conversion path is exercised end-to-end: a tiny HLS tree (master
 * playlist + fMP4 segment variant with muxed audio, matching Pinterest's
 * live structure) is generated with the project's own ffmpeg-static
 * dependency, served over a local HTTP server, converted via
 * convertHlsToMp4, and the resulting MP4 is probed with ffmpeg for
 * stream/duration sanity.
 *
 * Failure paths (404 playlist, unparseable playlist, invalid output)
 * verify error classification and temp-file cleanup.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFile } from "node:child_process";
import { parse } from "hls-parser";
import ffmpegPath from "ffmpeg-static";
import { convertHlsToMp4, selectBestVariant, normalizeAudioGroupId, selectAudioUrl, validateMp4 } from "../../src/core/hls/convert.js";
import { withServer, nolog } from "../helpers/index.js";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pjs-hls-"));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Generate a small self-contained HLS tree in `dir` using MPEG-TS segments
 * (deterministic across ffmpeg builds — no fMP4 init-segment CWD quirk).
 * Returns the master playlist text (also written to <dir>/master.m3u8),
 * or null when ffmpeg is unavailable/generation fails.
 *
 * @param {string} dir
 * @param {{ separateAudio?: boolean }} [opts]
 *   separateAudio=true adds an EXT-X-MEDIA audio rendition (exercises the
 *   `-map 1:a:0` ffmpeg branch); default keeps audio muxed into the video
 *   variant (exercises the `-map 0:a?` branch, Pinterest's live shape).
 */
function buildHlsFixture(dir, { separateAudio = false } = {}) {
  if (!ffmpegPath) return null;
  const gen = path.join(dir, "gen");
  fs.mkdirSync(gen, { recursive: true });
  const src = path.join(dir, "src.mp4");
  const run = (args) =>
    spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "ignore" });

  // 1s 64x64 test pattern with a 440 Hz audio track
  const r = run([
    "-f", "lavfi", "-i", "testsrc=size=64x64:rate=10:duration=1",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-movflags", "+faststart", src,
  ]);
  if (r.status !== 0 || !fs.existsSync(src)) return null;

  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"];

  if (separateAudio) {
    const audDir = path.join(dir, "v_audio");
    fs.mkdirSync(audDir, { recursive: true });
    const ra = run([
      "-i", src, "-vn", "-c:a", "copy",
      "-f", "hls", "-hls_time", "1", "-hls_list_size", "0",
      "-hls_segment_filename", path.join(audDir, "seg_%03d.ts"),
      path.join(audDir, "variant.m3u8"),
    ]);
    if (ra.status !== 0 || !fs.existsSync(path.join(audDir, "variant.m3u8"))) return null;
    lines.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="1",AUTOSELECT=YES,CHANNELS="2",URI="v_audio/variant.m3u8"');
  }

  const vidDir = path.join(dir, "v_576");
  fs.mkdirSync(vidDir, { recursive: true });
  const rv = run([
    "-i", src, "-c", "copy",
    "-f", "hls", "-hls_time", "1", "-hls_list_size", "0",
    "-hls_segment_type", "mpegts",
    "-hls_segment_filename", path.join(vidDir, "seg_%03d.ts"),
    path.join(vidDir, "variant.m3u8"),
  ]);
  if (rv.status !== 0 || !fs.existsSync(path.join(vidDir, "variant.m3u8"))) return null;

  const audioAttr = separateAudio ? ',AUDIO="audio"' : "";
  lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=64x64,CODECS="avc1.64001f,mp4a.40.2"${audioAttr}`);
  lines.push("v_576/variant.m3u8", "");
  const master = lines.join("\n");
  fs.writeFileSync(path.join(dir, "master.m3u8"), master);
  return master;
}

describe("HLS variant selection (fixture, unit-level)", () => {
  const masterText = fs.readFileSync(path.join(FIXTURE_DIR, "hls/master-576.m3u8"), "utf8");
  const master = parse(masterText);

  it("selects the highest-resolution variant", () => {
    const { best, variantUrl } = selectBestVariant(master);
    assert.equal(best.resolution.width, 576);
    assert.equal(best.resolution.height, 576);
    assert.ok(
      variantUrl("https://v1.pinimg.com/videos/iht/hls/4d/eb/d8/4debd8726aea4e2a3e99ff5d7094aec7.m3u8").endsWith("_720w.m3u8"),
    );
  });
  it("throws when playlist has no variants", () => {
    assert.throws(() => selectBestVariant({ variants: [] }), /no variants/);
  });
  it("normalizes audio group id (array shape from fixture)", () => {
    const { best } = selectBestVariant(master);
    assert.equal(normalizeAudioGroupId(best), "audio");
  });
  it("resolves the pinned fixture's separate audio rendition", () => {
    const { best } = selectBestVariant(master);
    const url = selectAudioUrl(master, "https://x/x.m3u8", best);
    assert.ok(url, "expected audio playlist url");
    assert.ok(url.endsWith("_audio.m3u8"));
  });
  it("returns null audio url for a muxed variant (no audio group, no medias)", () => {
    const muxed = { variants: [{ uri: "v.m3u8", resolution: { width: 576, height: 576 }, bandwidth: 500000 }], medias: [] };
    const url = selectAudioUrl(muxed, "https://x/x.m3u8", muxed.variants[0]);
    assert.equal(url, null);
  });
  it("handles string audio group", () => {
    assert.equal(normalizeAudioGroupId({ audio: "audio1" }), "audio1");
    assert.equal(normalizeAudioGroupId({ audio: { groupId: "g1" } }), "g1");
    assert.equal(normalizeAudioGroupId({ attributes: { AUDIO: "a9" } }), "a9");
    assert.equal(normalizeAudioGroupId({}), null);
  });
  it("resolves separate audio rendition from medias list", () => {
    const hlsObj = { variants: [], medias: [{ type: "AUDIO", groupId: "a1", uri: "aud/a1.m3u8" }] };
    const url = selectAudioUrl(hlsObj, "https://x.com/hls/master.m3u8", { audio: "a1" });
    assert.equal(url, "https://x.com/hls/aud/a1.m3u8");
  });
});

describe("convertHlsToMp4 (integration)", () => {
  it("converts a served HLS tree to a valid MP4", async () => {
    const dir = tmpDir();
    try {
      const master = buildHlsFixture(dir);
      if (!master) {
        console.log("  [skip] ffmpeg generation failed on this platform");
        return;
      }
      const srv = await serveTree(dir);
      try {
        const outPath = path.join(dir, "out", "video.mp4");
        const result = await convertHlsToMp4({ hlsUrl: `${srv.url}/master.m3u8`, outputPath: outPath, log: nolog });
        assert.equal(result.status, true);
        assert.ok(fs.existsSync(result.file));
        assert.ok(result.bytes > 1024, `expected >1 kB, got ${result.bytes}`);
        assert.equal(path.basename(result.file), "video.mp4");
        assert.equal(result.resolution, "64x64");

        // validate MP4 structure
        validateMp4(result.file);

        // probe with ffmpeg: video + audio stream must exist
        const probe = await ffmpegProbe(result.file);
        assert.match(probe, /Video: h264/);
        assert.match(probe, /Audio: aac/);
        assert.match(probe, /Duration: 00:00:01/);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("converts a tree with a separate audio rendition (maps 1:a:0)", async () => {
    const dir = tmpDir();
    try {
      const master = buildHlsFixture(dir, { separateAudio: true });
      if (!master) {
        console.log("  [skip] ffmpeg generation failed on this platform");
        return;
      }
      const srv = await serveTree(dir);
      try {
        const outPath = path.join(dir, "out", "video.mp4");
        const result = await convertHlsToMp4({ hlsUrl: `${srv.url}/master.m3u8`, outputPath: outPath, log: nolog });
        assert.equal(result.status, true);
        const probe = await ffmpegProbe(result.file);
        assert.match(probe, /Video: h264/);
        assert.match(probe, /Audio: aac/);
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("fails with E_FFMPEG on HTTP 404 master playlist and cleans up", async () => {
    const dir = tmpDir();
    try {
      const srv = await withServer((req, res) => {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
      });
      try {
        const outPath = path.join(dir, "out", "video.mp4");
        await assert.rejects(
          convertHlsToMp4({ hlsUrl: `${srv.url}/missing.m3u8`, outputPath: outPath, log: nolog }),
          (err) => err.code === "E_FFMPEG" && /HTTP 404/.test(err.message),
        );
        assert.ok(!fs.existsSync(outPath));
        assert.ok(!fs.existsSync(`${outPath}.part.mp4`));
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("fails on an unparseable master playlist", async () => {
    const dir = tmpDir();
    try {
      const srv = await withServer((req, res) => {
        res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
        res.end("this is not an m3u8 playlist at all\n");
      });
      try {
        await assert.rejects(
          convertHlsToMp4({ hlsUrl: `${srv.url}/bad.m3u8`, outputPath: path.join(dir, "v.mp4"), log: nolog }),
          (err) => err.code === "E_FFMPEG" && /unparseable|no variants/.test(err.message),
        );
      } finally {
        await srv.close();
      }
    } finally {
      cleanup(dir);
    }
  });

  it("rejects invalid MP4 output in validateMp4", () => {
    const dir = tmpDir();
    try {
      const bad = path.join(dir, "bad.mp4");
      fs.writeFileSync(bad, Buffer.alloc(2048, 0x41)); // not an MP4
      assert.throws(() => validateMp4(bad), /not a valid MP4/);
      const tiny = path.join(dir, "tiny.mp4");
      fs.writeFileSync(tiny, Buffer.alloc(10));
      assert.throws(() => validateMp4(tiny), /too small/);
    } finally {
      cleanup(dir);
    }
  });
});

/**
 * Serve a directory tree over local HTTP (m3u8/ts/mp4 content types).
 * @param {string} dir
 */
async function serveTree(dir) {
  return withServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\//, "").replace(/\//g, path.sep);
    const file = path.join(dir, urlPath);
    if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const type = urlPath.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : urlPath.endsWith(".ts")
        ? "video/mp2t"
        : "video/mp4";
    res.writeHead(200, { "content-type": type });
    fs.createReadStream(file).pipe(res);
  });
}

/**
 * Run `ffmpeg -i <file>` and capture the stream dump (written to stderr).
 * ffmpeg exits 1 in this mode, which is expected — we only want the text.
 * @param {string} file
 * @returns {Promise<string>}
 */
function ffmpegProbe(file) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ["-hide_banner", "-i", file], (err, _stdout, stderr) => {
      if (!stderr) return reject(err ?? new Error("ffmpeg produced no probe output"));
      resolve(stderr);
    });
  });
}
