// Phase 1 probe 3 — fresh pins from live feed, fresh CDN test, board resource
import axios from "axios";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const client = axios.create({ headers: { "User-Agent": UA }, timeout: 20000 });
const out = {};
const save = (k, v) => { out[k] = v; console.log(`--- ${k} ---`); console.log(JSON.stringify(v, null, 2).slice(0, 1600)); };

const rx = /window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\(\s*"(?:\\.|[^"\\])*"\s*,\s*(\{[\s\S]*?\})\s*\)\s*;?/g;
function parseRelays(html) {
  const res = [];
  let m;
  while ((m = rx.exec(html)) !== null) {
    try { res.push(JSON.parse(m[1])); } catch { /* partial */ }
  }
  return res;
}

// 1. live feed for seihin_
const profHtml = (await client.get("https://id.pinterest.com/seihin_/")).data;
const appVersion = profHtml.match(/['"]appVersion['"]\:['"](\w+?)['"]/)?.[1];
const userId = profHtml.match(/['"]profile_cover['"]\:\{['"]id['"]\:['"](\d+?)['"]/i)?.[1];
save("profile", { appVersion, userId });

const data = {
  options: { exclude_add_pin_rep: true, field_set_key: "grid_item", is_own_profile_pins: false, redux_normalize_feed: true, user_id: userId, username: "seihin_" },
  context: {},
};
const feedRes = await client.get(
  `https://id.pinterest.com/resource/UserActivityPinsResource/get/?source_url=${encodeURIComponent("/seihin_/")}&data=${encodeURIComponent(JSON.stringify(data))}&_=${Date.now()}`,
  {
    headers: {
      accept: "application/json, text/javascript, */*, q=0.01",
      "x-requested-with": "XMLHttpRequest",
      "x-pinterest-appstate": "active",
      referer: "https://id.pinterest.com/",
      "x-app-version": appVersion,
      "x-pinterest-pws-handler": "www/[username].js",
      "x-pinterest-source-url": "/seihin_/",
    },
  },
);
const rr = feedRes.data.resource_response;
const pins = rr.data;
save("feed", { count: pins.length, bookmark: !!rr.bookmark });

// inspect first few pins: images / videos / story
for (const [i, p] of pins.slice(0, 4).entries()) {
  save(`feed.pin${i}`, {
    id: p.id, type: p.type, titleType: typeof p.title,
    imageKeys: p.images ? Object.keys(p.images) : null,
    origUrl: p.images?.orig?.url?.slice(0, 90),
    videosKeys: p.videos ? Object.keys(p.videos.video_list ?? {}) : null,
    storyVideo: p.story_pin_data?.pages?.[0]?.blocks?.[0]?.video ? "yes" : null,
    storyVideoList: p.story_pin_data?.pages?.[0]?.blocks?.[0]?.video?.video_list
      ? Object.keys(p.story_pin_data.pages[0].blocks[0].video.video_list) : null,
  });
}

// 2. fresh image pin relay parse — use the FIRST pin from the feed
const pinId1 = pins.find((p) => p.images?.orig)?.id ?? pins[0].id;
const pinHtml = (await client.get(`https://id.pinterest.com/pin/${pinId1}/`)).data;
const relays = parseRelays(pinHtml);
save("pin.relayCount", relays.length);
let imgFound = null;
for (const r of relays) {
  for (const k of Object.keys(r.data ?? {})) {
    const d = r.data[k]?.data;
    if (d?.imageLargeUrl) imgFound = d.imageLargeUrl;
    if (d?.videos?.video_list) save("pin.videoList", Object.keys(d.videos.video_list));
  }
}
save("pin.imageLargeUrl", imgFound);

// 3. fresh CDN GET on the live orig URL
const freshImg = pins.find((p) => p.images?.orig?.url)?.images.orig.url;
if (freshImg) {
  const r = await client.get(freshImg, { responseType: "stream" });
  let first = Buffer.alloc(0);
  r.data.on("data", (c) => { first = Buffer.concat([first, c]); r.data.destroy(); });
  await new Promise((res) => r.data.on("close", res).on("end", res));
  save("cdn.freshImage", { status: r.status, type: r.headers["content-type"], len: r.headers["content-length"], magic: first.slice(0, 6).toString("hex") });
}

// 4. BoardsResource for seihin_
const bdata = {
  options: {
    privacy_filter: "all", sort: "last_pinned_to", field_set_key: "profile_grid_item",
    filter_stories: false, username: "seihin_", page_size: 25,
    group_by: "visibility", include_archived: true, redux_normalize_feed: true, filter_all_pins: false,
  },
  context: {},
};
try {
  const bres = await client.get(
    `https://id.pinterest.com/resource/BoardsResource/get/?source_url=${encodeURIComponent("/seihin_/_saved/")}&data=${encodeURIComponent(JSON.stringify(bdata))}&_=${Date.now()}`,
    {
      headers: {
        accept: "application/json, text/javascript, */*, q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "x-pinterest-appstate": "active",
        referer: "https://id.pinterest.com/",
        "x-app-version": appVersion,
        "x-pinterest-pws-handler": "www/[username]/_saved.js",
        "x-pinterest-source-url": "/seihin_/_saved/",
      },
    },
  );
  const brr = bres.data.resource_response;
  save("boards", {
    count: Array.isArray(brr.data) ? brr.data.length : brr.data,
    first: Array.isArray(brr.data) && brr.data[0]
      ? { id: brr.data[0].id, url: brr.data[0].url, name: brr.data[0].name, pin_count: brr.data[0].pin_count }
      : brr,
  });
} catch (e) { save("boards.ERROR", e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message); }

// 5. pin.it real short link — extract one from feed pin share urls? Use pinterest.com/pin redirect form instead:
// older pins often respond with /pin/<id>/ redirect from pin.it only if token valid. Skip inventing tokens.
fs.writeFileSync("tmp-probe/results3.json", JSON.stringify(out, null, 2));
