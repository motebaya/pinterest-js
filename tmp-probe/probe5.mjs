// Phase 1 probe 5 — HLS pipeline live check + ffmpeg
import axios from "axios";
import { parse } from "hls-parser";
import fs from "node:fs";
import { execSync } from "node:child_process";

const out = {};
const save = (k, v) => { out[k] = v; console.log(`--- ${k} ---`); console.log(JSON.stringify(v, null, 2).slice(0, 2000)); };

const m3u8Url = "https://v1.pinimg.com/videos/iht/hls/4d/eb/d8/4debd8726aea4e2a3e99ff5d7094aec7.m3u8";
const res = await axios.get(m3u8Url, { responseType: "text", timeout: 20000 });
fs.writeFileSync("tmp-probe/live.m3u8", res.data);
const hls = parse(res.data);
save("master", {
  variants: hls.variants.map((v) => ({
    res: v.resolution ? `${v.resolution.width}x${v.resolution.height}` : null,
    bandwidth: v.bandwidth,
    codecs: v.codecs,
    audio: Array.isArray(v.audio) ? v.audio.map((a) => a.groupId) : v.audio,
    uri: v.uri.slice(0, 80),
  })),
  medias: (hls.medias ?? []).map((m) => ({ type: m.type, groupId: m.groupId, name: m.name, uri: !!m.uri })),
});

// fetch best variant playlist header
const best = hls.variants.slice().sort((a, b) => {
  const ap = (a.resolution?.width ?? 0) * (a.resolution?.height ?? 0);
  const bp = (b.resolution?.width ?? 0) * (b.resolution?.height ?? 0);
  return bp - ap;
})[0];
const bestUrl = new URL(best.uri, new URL(m3u8Url)).toString();
save("bestVariant", { url: bestUrl.slice(0, 110) });

const vres = await axios.get(bestUrl, { responseType: "text", timeout: 20000 });
const vlines = vres.data.split("\n").filter(Boolean);
save("variantPlaylist", {
  lines: vlines.length,
  segments: vlines.filter((l) => !l.startsWith("#")).length,
  keys: vlines.filter((l) => l.startsWith("#EXT-X-KEY")).slice(0, 2),
  firstSegment: vlines.filter((l) => !l.startsWith("#"))[0]?.slice(0, 100),
});

// audio media playlist
const audioMedia = (hls.medias ?? []).find((m) => m.type === "AUDIO" && m.uri);
if (audioMedia) {
  const aurl = new URL(audioMedia.uri, new URL(m3u8Url)).toString();
  const ares = await axios.get(aurl, { responseType: "text", timeout: 20000 });
  save("audioPlaylist", { url: aurl.slice(0, 110), segments: ares.data.split("\n").filter((l) => l && !l.startsWith("#")).length });
}

// ffmpeg remux test
const ffmpegPath = (await import("ffmpeg-static")).default;
console.log("ffmpeg:", ffmpegPath);
const t0 = Date.now();
try {
  execSync(`"${ffmpegPath}" -y -loglevel error -protocol_whitelist file,http,https,tcp,tls,crypto -i "${bestUrl}" -map 0:v:0 -map 0:a? -c copy -bsf:a aac_adtstoasc -movflags +faststart tmp-probe/live-remux.mp4`, { timeout: 120000 });
  const st = fs.statSync("tmp-probe/live-remux.mp4");
  // probe output with ffprobe if available via ffmpeg? use ffmpeg -i to read format
  const probe = execSync(`"${ffmpegPath}" -i tmp-probe/live-remux.mp4 2>&1 | grep -E "Duration|Stream"`).toString();
  save("remux", { ok: true, bytes: st.size, seconds: ((Date.now() - t0) / 1000).toFixed(1), probe: probe.trim() });
} catch (e) {
  save("remux.ERROR", e.message.slice(0, 600));
}

fs.writeFileSync("tmp-probe/results5.json", JSON.stringify(out, null, 2));
