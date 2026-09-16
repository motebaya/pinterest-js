// Phase 1 probe 2 — video pin deep dive, CDN behavior, pin.it
import axios from "axios";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const client = axios.create({ headers: { "User-Agent": UA }, timeout: 20000 });
const out = {};
const save = (k, v) => { out[k] = v; console.log(`--- ${k} ---`); console.log(JSON.stringify(v, null, 2).slice(0, 1800)); };

const rxMedia = /window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\(\s*"(?<payload>(?:\\.|[^"\\]))*"\s*,\s*(?<json>\{[\s\S]*?\})\s*\)\s*;?/;

// Parse ALL relay occurrences, not just the first
function parseAllRelay(html) {
  const results = [];
  const rx = /window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\(\s*"(?:\\.|[^"\\])*"\s*,\s*(\{[\s\S]*?\})\s*\)\s*;?/g;
  let m;
  while ((m = rx.exec(html)) !== null) {
    try { results.push(JSON.parse(m[1])); } catch { /* skip */ }
  }
  return results;
}

function findPinData(relays) {
  for (const r of relays) {
    const keys = Object.keys(r.data ?? {});
    for (const k of keys) {
      const rec = r.data[k];
      const d = rec?.data;
      if (d && (d.imageLargeUrl || d.storyPinData || d.videos)) return { key: k, data: d };
    }
  }
  return null;
}

// 1. Video pin: full relay scan
const videoPinUrl = "https://id.pinterest.com/pin/996773467435224988/";
const vHtml = (await client.get(videoPinUrl)).data;
fs.writeFileSync("tmp-probe/videoPin.html", vHtml);
const vRelays = parseAllRelay(vHtml);
const vPin = findPinData(vRelays);
save("videoPin.relayCount", vRelays.length);
if (vPin) {
  const sp = vPin.data.storyPinData;
  const block = sp?.pages?.[0]?.blocks?.[0];
  const vd = block?.videoDataV2;
  save("videoPin.data", {
    relayKey: vPin.key,
    hasStoryPinData: !!sp,
    blockKeys: block ? Object.keys(block) : null,
    videoDataV2Keys: vd ? Object.keys(vd) : null,
    videoList720P: vd?.videoList720P
      ? Object.fromEntries(Object.entries(vd.videoList720P).map(([k, v]) => [k, { url: v.url?.slice(0, 120), w: v.width, h: v.height, duration: v.duration }]))
      : null,
    videos: vPin.data.videos
      ? Object.fromEntries(Object.entries(vPin.data.videos.video_list ?? {}).map(([k, v]) => [k, { url: v.url?.slice(0, 120), w: v.width, h: v.height }]))
      : null,
  });
} else {
  save("videoPin.data", null);
}

// 2. Also check old-style videos.video_list on the same pin (V_720P direct mp4?)
if (vPin?.data?.videos?.video_list) {
  const vl = vPin.data.videos.video_list;
  save("videoPin.videoListKeys", Object.keys(vl));
  const v720 = vl.V_720P;
  if (v720?.url) {
    // 3. CDN behavior on video mp4 URL
    try {
      const r = await client.get(v720.url, { responseType: "stream", maxRedirects: 5 });
      save("cdn.video", { status: r.status, type: r.headers["content-type"], len: r.headers["content-length"], finalUrl: r.request?.res?.responseUrl?.slice(0, 120) });
      r.data.destroy();
    } catch (e) { save("cdn.video.ERROR", e.response ? e.response.status : e.message); }
  }
}

// 4. CDN image GET (HEAD gave 403 — try GET with range)
try {
  const r = await client.get("https://i.pinimg.com/originals/4d/ef/17/4def17213b096617963711832ed6e180.jpg", {
    responseType: "stream",
    headers: { Referer: "https://id.pinterest.com/", "User-Agent": UA },
  });
  const chunks = [];
  let n = 0;
  r.data.on("data", (c) => { if (n < 2) { chunks.push(c); n++; } else r.data.destroy(); });
  await new Promise((res) => r.data.on("end", res).on("close", res));
  save("cdn.image.GET", { status: r.status, type: r.headers["content-type"], len: r.headers["content-length"], firstBytes: Buffer.concat(chunks).slice(0, 8).toString("hex") });
} catch (e) { save("cdn.image.GET.ERROR", e.response ? `${e.response.status} ${e.response.headers?.["content-type"]}` : e.message); }

// 5. HEAD with Referer
try {
  const r = await client.head("https://i.pinimg.com/originals/4d/ef/17/4def17213b096617963711832ed6e180.jpg", { headers: { Referer: "https://id.pinterest.com/" } });
  save("cdn.image.HEAD.referer", { status: r.status, type: r.headers["content-type"], len: r.headers["content-length"] });
} catch (e) { save("cdn.image.HEAD.referer.ERROR", e.response ? e.response.status : e.message); }

// 6. pin.it short URL
try {
  const r = await client.get("https://pin.it/2xWqLHzwW4NuoEo", { maxRedirects: 5, headers: { "User-Agent": UA } });
  const html = typeof r.data === "string" ? r.data : "";
  fs.writeFileSync("tmp-probe/pinit.html", html);
  const relays = parseAllRelay(html);
  const pin = findPinData(relays);
  save("pin.it", {
    finalStatus: r.status,
    finalUrl: (r.request?.res?.responseUrl ?? "").slice(0, 100),
    htmlBytes: html.length,
    relayCount: relays.length,
    pinFound: !!pin,
    imageLargeUrl: pin?.data?.imageLargeUrl?.slice(0, 100) ?? null,
  });
} catch (e) { save("pin.it.ERROR", e.response ? e.response.status : e.message); }

fs.writeFileSync("tmp-probe/results2.json", JSON.stringify(out, null, 2));
