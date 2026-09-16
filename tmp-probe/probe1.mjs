// Phase 1 live verification probe — NOT part of the app. Temporary.
import axios from "axios";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const client = axios.create({
  headers: { "User-Agent": UA, "accept-language": "en-US,en;q=0.9" },
  timeout: 20000,
  maxRedirects: 5,
});
const out = {};
const save = (k, v) => { out[k] = v; console.log(`--- ${k} ---`); console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2).slice(0, 1500)); };

// 1. Profile page — appVersion + userId regexes
const rxApp = /['"]appVersion['"]\:['"](\w+?)['"]/;
const rxU1 = /['"]profile_cover['"]\:\{['"]id['"]\:['"](\d+?)['"]/i;
const rxU2 = /(?<=\/users\/)(\d+)(?=\/pins)/;
const rxU3 = /(?<=\<script\s+[^>]*id\=\"__PWS_INITIAL_PROPS__\"\s+[^>]*type\=\"application\/json\">)(.*?)(?=\<\/script>)/;

async function probeProfile(username) {
  try {
    const res = await client.get(`https://id.pinterest.com/${username}/`);
    const html = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    fs.writeFileSync("tmp-probe/profile.html", html);
    const app = html.match(rxApp);
    const u1 = html.match(rxU1);
    const u2 = html.match(rxU2);
    const u3 = html.match(rxU3);
    save("profile", {
      status: res.status, bytes: html.length,
      appVersion: app ? app[1] : null,
      userId1: u1 ? u1[1] : null,
      userId2: u2 ? u2[1] : null,
      userId3: u3 ? u3[1].slice(0, 200) : null,
    });
    return { appVersion: app?.[1], userId: u1?.[1] ?? u2?.[1] };
  } catch (e) {
    save("profile.ERROR", e.message);
    return null;
  }
}

// 2. UserActivityPinsResource
async function probeFeed(username, userId, appVersion) {
  const data = {
    options: {
      exclude_add_pin_rep: true,
      field_set_key: "grid_item",
      is_own_profile_pins: false,
      redux_normalize_feed: true,
      user_id: userId,
      username,
    },
    context: {},
  };
  const url = `https://id.pinterest.com/resource/UserActivityPinsResource/get/?source_url=${encodeURIComponent(`/${username}/`)}&data=${encodeURIComponent(JSON.stringify(data))}&_=${Date.now()}`;
  const headers = {
    accept: "application/json, text/javascript, */*, q=0.01",
    "x-requested-with": "XMLHttpRequest",
    "x-pinterest-appstate": "active",
    referer: "https://id.pinterest.com/",
    "x-app-version": appVersion,
    "x-pinterest-pws-handler": "www/[username].js",
    "x-pinterest-source-url": `/${username}/`,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };
  try {
    const res = await client.get(url, { headers });
    const body = res.data;
    const rr = body?.resource_response;
    fs.writeFileSync("tmp-probe/feed.json", JSON.stringify(body, null, 2).slice(0, 500000));
    save("feed", {
      status: res.status,
      envelope: rr ? { status: rr.status, code: rr.code, message: rr.message, dataLen: Array.isArray(rr.data) ? rr.data.length : typeof rr.data, hasBookmark: !!rr.bookmark } : body,
      firstPinKeys: rr?.data?.[0] ? Object.keys(rr.data[0]).slice(0, 30) : null,
      firstPinImages: rr?.data?.[0]?.images ? Object.keys(rr.data[0].images) : null,
      firstPinVideo: rr?.data?.[0]?.videos ? Object.keys(rr.data[0].videos?.video_list ?? {}) : null,
      firstTitleType: typeof rr?.data?.[0]?.title,
    });
  } catch (e) {
    save("feed.ERROR", e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 500)}` : e.message);
  }
}

// 3. Pin page (image pin + video pin) — MEDIA_DATA regex
const rxMedia = /window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\(\s*"(?<payload>(?:\\.|[^"\\]))*"\s*,\s*(?<json>\{[\s\S]*?\})\s*\)\s*;?/;
async function probePin(url, label) {
  try {
    const res = await client.get(url);
    const html = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    fs.writeFileSync(`tmp-probe/${label}.html`, html);
    const m = html.match(rxMedia);
    if (!m || !m.groups?.json) { save(`pin.${label}`, { status: res.status, mediaDataMatch: false, htmlHasRelay: html.includes("__PWS_RELAY_REGISTER_COMPLETED_REQUEST__") }); return; }
    let parsed;
    try { parsed = JSON.parse(m.groups.json); } catch (e) { save(`pin.${label}.parseError`, e.message.slice(0, 300)); return; }
    const keys = Object.keys(parsed.data ?? {});
    const first = parsed.data?.[keys[0]]?.data;
    save(`pin.${label}`, {
      status: res.status,
      relayKeys: keys.slice(0, 5),
      firstDataKeys: first ? Object.keys(first).slice(0, 40) : null,
      imageLargeUrl: first?.imageLargeUrl ?? null,
      storyPin: first?.storyPinData ? {
        pagesLen: first.storyPinData.pages?.length,
        videoDataV2: first.storyPinData.pages?.[0]?.blocks?.[0]?.videoDataV2
          ? Object.keys(first.storyPinData.pages[0].blocks[0].videoDataV2)
          : null,
      } : null,
    });
  } catch (e) {
    save(`pin.${label}.ERROR`, e.response ? `${e.response.status}` : e.message);
  }
}

// 4. CDN image fetch (HEAD)
async function probeImage(url) {
  try {
    const res = await client.head(url);
    save("image", { status: res.status, type: res.headers["content-type"], len: res.headers["content-length"] });
  } catch (e) { save("image.ERROR", e.response ? e.response.status : e.message); }
}

const profile = await probeProfile("seihin_");
if (profile?.appVersion && profile?.userId) {
  await probeFeed("seihin_", profile.userId, profile.appVersion);
}
await probePin("https://id.pinterest.com/pin/607986018480305531/", "imagePin");
await probePin("https://id.pinterest.com/pin/996773467435224988/", "videoPin");
await probeImage("https://i.pinimg.com/originals/4d/ef/17/4def17213b096617963711832ed6e180.jpg");

fs.writeFileSync("tmp-probe/results.json", JSON.stringify(out, null, 2));
