// Phase 1 probe 4 — wendihariyanto49 boards/sections/section-content/board-feed + video pin
import axios from "axios";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const client = axios.create({ headers: { "User-Agent": UA }, timeout: 20000 });
const out = {};
const save = (k, v) => { out[k] = v; console.log(`--- ${k} ---`); console.log(JSON.stringify(v, null, 2).slice(0, 1600)); };

const USER = "wendihariyanto49";

const profHtml = (await client.get(`https://id.pinterest.com/${USER}/`)).data;
const appVersion = profHtml.match(/['"]appVersion['"]\:['"](\w+?)['"]/)?.[1];
const userId = profHtml.match(/['"]profile_cover['"]\:\{['"]id['"]\:['"](\d+?)['"]/i)?.[1];
save("profile", { appVersion, userId });

async function resource(rname, dataObj, sourceUrl, pws) {
  const res = await client.get(
    `https://id.pinterest.com/resource/${rname}/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(dataObj))}&_=${Date.now()}`,
    {
      headers: {
        accept: "application/json, text/javascript, */*, q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "x-pinterest-appstate": "active",
        referer: "https://id.pinterest.com/",
        "x-app-version": appVersion,
        "x-pinterest-pws-handler": pws,
        "x-pinterest-source-url": sourceUrl,
      },
    },
  );
  return res.data.resource_response;
}

// 1. boards
const boards = await resource("BoardsResource", {
  options: {
    privacy_filter: "all", sort: "last_pinned_to", field_set_key: "profile_grid_item",
    filter_stories: false, username: USER, page_size: 25,
    group_by: "visibility", include_archived: true, redux_normalize_feed: true, filter_all_pins: false,
  },
  context: {},
}, `/${USER}/_saved/`, "www/[username]/_saved.js");
save("boards", {
  count: boards.data.length, bookmark: !!boards.bookmark,
  first: boards.data[0] ? { id: boards.data[0].id, name: boards.data[0].name, url: boards.data[0].url, pin_count: boards.data[0].pin_count, type: boards.data[0].type } : null,
  sectioned: boards.data.filter((b) => b.has_section)?.length ?? 0,
});
const animeBoard = boards.data.find((b) => b.id === "1021332090435057038") ?? boards.data[0];
const BOARD_SLUG = animeBoard.url.replace(/^\/|\/$/g, "").split("/").slice(-1)[0];

// 2. board sections
const sections = await resource("BoardSectionsResource", {
  options: {
    board_id: animeBoard.id, board_url: `/${USER}/${BOARD_SLUG}/`,
    currentFilter: -1, field_set_key: "react_grid_pin", filter_section_pins: true,
    sort: "default", layout: "default", page_size: 25, redux_normalize_feed: true,
  },
  context: {},
}, `/${USER}/${BOARD_SLUG}/`, "www/[username]/[slug].js");
save("sections", {
  count: Array.isArray(sections.data) ? sections.data.length : sections.data,
  first: sections.data?.[0] ? { id: sections.data[0].id, slug: sections.data[0].slug, name: sections.data[0].name, pin_count: sections.data[0].pin_count } : null,
});

// 3. section content (if any)
if (sections.data?.[0]) {
  const sec = sections.data[0];
  const secContent = await resource("BoardSectionPinsResource", {
    options: { page_size: 25, prepend: false, section_id: sec.id },
    context: {},
  }, `/${USER}/${BOARD_SLUG}/${sec.slug}/`, "www/[username]/[slug]/[section_slug].js");
  const pin = secContent.data?.[0];
  save("sectionContent", {
    count: Array.isArray(secContent.data) ? secContent.data.length : secContent.data,
    first: pin ? {
      id: pin.id, titleType: typeof pin.title,
      imageOrig: pin.images?.orig?.url?.slice(0, 80),
      videos: pin.videos ? Object.keys(pin.videos.video_list ?? {}) : null,
      storyVideoList: pin.story_pin_data?.pages?.[0]?.blocks?.[0]?.video?.video_list
        ? Object.keys(pin.story_pin_data.pages[0].blocks[0].video.video_list) : null,
    } : null,
  });
}

// 4. board feed (all pins of a board) — the config whose alias was broken
const boardFeed = await resource("BoardFeedResource", {
  options: {
    board_id: animeBoard.id, board_url: `/${USER}/${BOARD_SLUG}/`,
    currentFilter: -1, field_set_key: "react_grid_pin", filter_section_pins: true,
    sort: "default", layout: "default", page_size: 25, redux_normalize_feed: true,
  },
  context: {},
}, `/${USER}/${BOARD_SLUG}/`, "www/[username]/[slug].js");
const bfp = boardFeed.data?.[0];
save("boardFeed", {
  count: Array.isArray(boardFeed.data) ? boardFeed.data.length : boardFeed.data,
  first: bfp ? {
    id: bfp.id, imageOrig: bfp.images?.orig?.url?.slice(0, 80),
    videos: bfp.videos ? Object.keys(bfp.videos.video_list ?? {}) : null,
  } : null,
});

// 5. video pin — fetch a few feed pages looking for a video pin
let videoPin = null;
let bookmark = rrBookmark(boards);
function rrBookmark() { return null; }
// search seihin_ feed pages for a video pin
let bookmarkNext = null;
let data2 = {
  options: { exclude_add_pin_rep: true, field_set_key: "grid_item", is_own_profile_pins: false, redux_normalize_feed: true, user_id: userId, username: "seihin_" },
  context: {},
};
for (let page = 0; page < 3 && !videoPin; page++) {
  if (bookmarkNext) data2.options.bookmarks = [bookmarkNext];
  const fr = await resource("UserActivityPinsResource", data2, "/seihin_/", "www/[username].js");
  const vp = (fr.data ?? []).find((p) => p.videos || p.story_pin_data?.pages?.[0]?.blocks?.[0]?.video);
  if (vp) { videoPin = vp; break; }
  bookmarkNext = fr.bookmark;
  if (!bookmarkNext) break;
}
if (videoPin) {
  const vl = videoPin.videos?.video_list ?? videoPin.story_pin_data?.pages?.[0]?.blocks?.[0]?.video?.video_list ?? {};
  save("videoPin", {
    id: videoPin.id,
    videosKeys: Object.keys(vl),
    sample: Object.fromEntries(Object.entries(vl).slice(0, 3).map(([k, v]) => [k, { url: v.url?.slice(0, 100), w: v.width, h: v.height, thumb: !!v.thumbnail }])),
    isHls: Object.values(vl).some((v) => String(v.url).includes(".m3u8")),
  });
} else {
  save("videoPin", "no video pin found in 3 pages of seihin_ feed");
}

fs.writeFileSync("tmp-probe/results4.json", JSON.stringify(out, null, 2));
