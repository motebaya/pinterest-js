/**
 * Live acceptance probe (run manually: node test/live/probe.mjs).
 *
 * Executes the full pin pipeline against the three acceptance targets with
 * the minimum number of network requests and validates the downloaded
 * artifacts (signature + size; video via ffprobe-equivalent ffmpeg dump).
 * Not part of the automated suite (network required).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { Pinterest } from "../../src/core/pinterest/index.js";
import { downloadMedia } from "../../src/core/downloader/download.js";
import { convertHlsToMp4 } from "../../src/core/hls/convert.js";
import { validateMp4 } from "../../src/core/hls/convert.js";
import { pinKind } from "../../src/core/media/select.js";
import { createNullLogger } from "../../src/util/logger.js";

const TARGETS = [
  { id: "1135610862296056785", expect: "image" },
  // The handoff document lists 1106619718936239771 for the carousel target,
  // but that pin returns PinNotFound live (verified 2026-09-16). The
  // continuation file's alternate 1106618939716239771 is a real carousel.
  { id: "1106619718936239771", expect: "carousel" },
  { id: "1106618939716239771", expect: "carousel", note: "alternate id from continues_task.md" },
  { id: "21532904464936103", expect: "video" },
];

const log = createNullLogger();
const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pjs-live-"));

function probeVideo(file) {
  return new Promise((resolve) => {
    execFile("ffmpeg", ["-hide_banner", "-i", file], (err, _o, stderr) => {
      resolve(stderr ?? "");
    });
  });
}

let results = [];
for (const t of TARGETS) {
  const entry = { id: t.id, expect: t.expect };
  try {
    const pinterest = new Pinterest({ log });
    const pin = await pinterest.extractPin({ pinInput: `https://www.pinterest.com/pin/${t.id}/`, log });
    entry.resolved = true;
    entry.pinKind = pinKind(pin);
    entry.title = pin.title?.slice(0, 60);
    entry.author = pin.author?.username;
    entry.mediaCount = pin.media.length;
    entry.media = pin.media.map((m) => `${m.kind}${m.container ? ":" + m.container : ""}${m.width ? " " + m.width + "x" + m.height : ""}`);

    if (t.expect === "video") {
      const video = pin.media.find((m) => m.kind === "video");
      if (!video) {
        entry.status = "FAIL";
        entry.error = "no video media found";
      } else if (video.container === "mp4") {
        const r = await downloadMedia({ url: video.url, expect: "video", outputDir: outRoot, showProgress: false, log });
        const stat = fs.statSync(r.file);
        entry.file = r.file;
        entry.bytes = stat.size;
        const probe = await probeVideo(r.file);
        entry.hasVideo = /Video: h264|Video: hevc|Video: vp/.test(probe);
        entry.duration = probe.match(/Duration: (\d+:\d+:\d+\.\d+)/)?.[1] ?? null;
        entry.status = stat.size > 0 && entry.hasVideo ? "PASS" : "FAIL";
      } else {
        const out = path.join(outRoot, `${t.id}.mp4`);
        const r = await convertHlsToMp4({ hlsUrl: video.url, outputPath: out, log });
        const stat = fs.statSync(r.file);
        entry.file = r.file;
        entry.bytes = stat.size;
        entry.resolution = r.resolution;
        const probe = await probeVideo(r.file);
        entry.hasVideo = /Video: /.test(probe);
        entry.duration = probe.match(/Duration: (\d+:\d+:\d+\.\d+)/)?.[1] ?? null;
        validateMp4(r.file);
        entry.status = stat.size > 0 && entry.hasVideo ? "PASS" : "FAIL";
      }
    } else {
      // image / carousel: download every image entry
      const images = pin.media.filter((m) => m.kind === "image");
      entry.downloads = [];
      let allOk = images.length > 0;
      for (const img of images) {
        try {
          const r = await downloadMedia({
            url: img.url,
            expect: "image",
            outputDir: path.join(outRoot, t.id),
            showProgress: false,
            log,
          });
          const bytes = fs.statSync(r.file).size;
          entry.downloads.push({ file: path.basename(r.file), bytes, ok: bytes > 0 });
          if (bytes === 0) allOk = false;
        } catch (err) {
          entry.downloads.push({ error: err.message, ok: false });
          allOk = false;
        }
      }
      entry.status = allOk ? "PASS" : "FAIL";
      entry.carouselCount = images.length;
    }
  } catch (err) {
    entry.status = err.code === "E_NETWORK" || err.code === "E_TIMEOUT" ? "BLOCKED" : "FAIL";
    entry.error = `${err.code ?? "ERR"}: ${err.message}`;
  }
  results.push(entry);
  console.log(JSON.stringify(entry, null, 2));
}

console.log("\n=== LIVE RESULTS ===");
for (const r of results) console.log(`${r.id.padEnd(22)} ${r.expect.padEnd(9)} ${r.status}`);
fs.rmSync(outRoot, { recursive: true, force: true });
