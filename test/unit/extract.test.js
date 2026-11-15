import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pickBestVideo,
  pickBestImage,
  storyPinVideo,
  normalizePin,
  normalizeBoard,
  normalizeBoardSection,
  videoListFromVideoDataV2,
} from "../../src/core/pinterest/normalize.js";
import { parseRelayPayloads, findPinRecord, mediaFromPinRecord } from "../../src/core/pinterest/pinPage.js";
import { RESOURCES, getResource } from "../../src/core/pinterest/resources.js";
import { validateDownloadedContent, validateResponseHeaders, detectMediaType } from "../../src/core/downloader/validate.js";
import { pinKind, planDownloads, selectPinsByType, requireMediaType } from "../../src/core/media/select.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("video rendition selection", () => {
  it("prefers V_720P native mp4", () => {
    const v = pickBestVideo({
      V_HLSV3_MOBILE: { url: "https://x/a.m3u8", width: 576, height: 576 },
      V_720P: { url: "https://x/a.mp4", width: 720, height: 1280 },
    });
    assert.equal(v.container, "mp4");
    assert.ok(v.url.endsWith(".mp4"));
  });
  it("falls back to HLS when no mp4 exists", () => {
    const v = pickBestVideo({
      V_HLSV3_MOBILE: { url: "https://x/a.m3u8", width: 576, height: 576 },
    });
    assert.equal(v.container, "hls");
  });
  it("prefers V_HLSV4 over V_HLSV3_MOBILE", () => {
    const v = pickBestVideo({
      V_HLSV3_MOBILE: { url: "https://x/3.m3u8", width: 100, height: 100 },
      V_HLSV4: { url: "https://x/4.m3u8", width: 100, height: 100 },
    });
    assert.ok(v.url.includes("/4.m3u8"));
  });
  it("returns null for empty lists", () => {
    assert.equal(pickBestVideo(null), null);
    assert.equal(pickBestVideo({}), null);
  });
});

describe("videoListFromVideoDataV2", () => {
  it("merges rendition groups from live pin page shape", () => {
    const merged = videoListFromVideoDataV2({
      videoListMobile: { vHLSV3Mobile: { url: "https://x/m.m3u8", width: 200, height: 200 } },
      videoList720P: { v720P: { url: "https://x/720.mp4", width: 576, height: 576 } },
      videoListEXP3: null,
    });
    assert.ok(merged["videoList720P.v720P"]);
    assert.ok(merged["videoListMobile.vHLSV3Mobile"]);
    const best = pickBestVideo(merged);
    assert.equal(best.container, "mp4");
    assert.ok(best.url.includes("720.mp4"));
  });
  it("handles flat entries with direct url", () => {
    const merged = videoListFromVideoDataV2({ V_720P: { url: "https://x/a.mp4" } });
    assert.ok(merged.V_720P);
  });
  it("returns null for empty objects", () => {
    assert.equal(videoListFromVideoDataV2({}), null);
    assert.equal(videoListFromVideoDataV2(null), null);
  });
});

describe("storyPinVideo", () => {
  it("extracts from snake_case story_pin_data (resource rows)", () => {
    const v = storyPinVideo({
      story_pin_data: {
        pages: [{ blocks: [{ video: { video_list: { V_HLSV3_MOBILE: { url: "https://x/a.m3u8", width: 576, height: 576 } } } }] }],
      },
    });
    assert.equal(v.container, "hls");
  });
  it("extracts from camelCase storyPinData + videoDataV2 (relay records)", () => {
    const v = storyPinVideo({
      storyPinData: {
        pages: [{ blocks: [{ videoDataV2: { videoList720P: { v720P: { url: "https://x/720.mp4", width: 576, height: 576 } } } }] }],
      },
    });
    assert.equal(v.container, "mp4");
  });
  it("returns null when no story video", () => {
    assert.equal(storyPinVideo({}), null);
    assert.equal(storyPinVideo({ storyPinData: { pages: [{ blocks: [{}] }] } }), null);
  });
});

describe("image selection", () => {
  it("prefers orig", () => {
    const img = pickBestImage({
      "236x": { url: "https://x/236.jpg", width: 236, height: 300 },
      orig: { url: "https://x/orig.jpg", width: 1200, height: 1500 },
    });
    assert.ok(img.url.includes("orig"));
  });
  it("falls back to largest area", () => {
    const img = pickBestImage({
      "236x": { url: "https://x/236.jpg", width: 236, height: 300 },
      "736x": { url: "https://x/736.jpg", width: 736, height: 900 },
    });
    assert.ok(img.url.includes("736"));
  });
});

describe("normalizePin", () => {
  it("normalizes image pins", () => {
    const pin = normalizePin({
      id: "111",
      title: "T",
      created_at: "2026-01-01",
      images: { orig: { url: "https://i/x.jpg", width: 100, height: 100 } },
    });
    assert.equal(pin.id, "111");
    assert.equal(pin.media.length, 1);
    assert.equal(pin.media[0].kind, "image");
  });
  it("normalizes story video pins (resource row shape)", () => {
    const pin = normalizePin({
      id: "222",
      title: "V",
      story_pin_data: { pages: [{ blocks: [{ video: { video_list: { V_HLSV3_MOBILE: { url: "https://v/a.m3u8", width: 576, height: 576 } } } }] }] },
      images: { orig: { url: "https://i/x.jpg" } },
    });
    assert.equal(pin.media.length, 2);
    assert.ok(pin.media.some((m) => m.kind === "video" && m.container === "hls"));
  });
  it("returns null when no usable media", () => {
    assert.equal(normalizePin({ id: "1", title: "x" }), null);
    assert.equal(normalizePin(null), null);
  });
});

describe("board/section normalizers", () => {
  it("normalizes boards with slug derivation", () => {
    const b = normalizeBoard({
      id: "1021332090435057038",
      url: "/wendihariyanto4924/anime-characters-8/",
      name: "Anime Characters 8",
      owner: { username: "wendihariyanto49" },
      pin_count: 361,
      image_cover_url: "https://i/cover.jpg",
    });
    assert.equal(b.slug, "anime-characters-8");
    assert.equal(b.pinCount, 361);
    assert.equal(b.owner, "wendihariyanto49");
  });
  it("normalizes sections", () => {
    const s = normalizeBoardSection({ id: "543", slug: "eiko-tsukimi", title: "Eiko Tsukimi", pin_count: 118 });
    assert.equal(s.slug, "eiko-tsukimi");
    assert.equal(s.pinCount, 118);
  });
});

describe("resource registry", () => {
  it("contains all verified resources", () => {
    for (const name of ["user.feed", "user.boards", "board.sections", "board.sectionPins", "board.pins"]) {
      assert.ok(RESOURCES[name], `missing ${name}`);
    }
  });
  it("throws on unknown resource", () => {
    assert.throws(() => getResource("nope"), /unknown resource/);
  });
  it("payload builders return null on insufficient opts", () => {
    assert.equal(RESOURCES["user.feed"].payload({ username: "x" }), null); // no userId
    assert.equal(RESOURCES["user.boards"].payload({}), null);
    assert.equal(RESOURCES["board.sections"].payload({ username: "x" }), null);
  });
  it("user.feed payload matches live-verified shape", () => {
    const p = RESOURCES["user.feed"].payload({ username: "u", userId: "123" });
    assert.equal(p.options.field_set_key, "grid_item");
    assert.equal(p.options.user_id, "123");
    assert.equal(Array.isArray(p.options.bookmarks), false);
  });
});

describe("pin page parsing (fixtures)", () => {
  const imageHtml = fs.readFileSync(path.join(fixtureDir, "html/pin-image.html"), "utf8");
  const notFoundHtml = fs.readFileSync(path.join(fixtureDir, "html/pin-notfound.html"), "utf8");

  it("extracts images from flat images_* relay records (live shape)", () => {
    const rec = {
      entityId: "1135610862296056785",
      __typename: "Pin",
      images_orig: { url: "https://i.pinimg.com/originals/e3/6e/c9/e36ec9b8d7e64213fb79e43c5339d08f.jpg", width: 736, height: 1311 },
      images_236x: { url: "https://i.pinimg.com/236x/e3/6e/c9/e36ec9b8d7e64213fb79e43c5339d08f.jpg", width: 236, height: 420 },
      images_736x: { url: "https://i.pinimg.com/736x/e3/6e/c9/e36ec9b8d7e64213fb79e43c5339d08f.jpg", width: 736, height: 1311 },
    };
    const media = mediaFromPinRecord(rec);
    assert.equal(media.length, 1);
    assert.equal(media[0].kind, "image");
    assert.ok(media[0].url.includes("/originals/"), "orig should win");
  });

  it("extracts one image per carousel slot in slot order", () => {
    const carousel = JSON.parse(fs.readFileSync(path.join(fixtureDir, "api/pin-carousel.json"), "utf8"));
    const media = mediaFromPinRecord(carousel);
    assert.equal(media.length, carousel.carouselData.carouselSlots.length);
    const urls = new Set(media.map((m) => m.url));
    assert.equal(urls.size, media.length, "carousel slots must not collapse to one url");
    for (const m of media) assert.equal(m.kind, "image");
  });

  it("prefers imageLargeUrl over the images map", () => {
    const rec = {
      entityId: "1",
      imageLargeUrl: "https://i.pinimg.com/1200x/aa/bb/cc/aabbcc.jpg",
      images_orig: { url: "https://i.pinimg.com/originals/aa/bb/cc/aabbcc.jpg" },
    };
    const media = mediaFromPinRecord(rec);
    assert.ok(media[0].url.includes("1200x"));
  });

  it("extracts imageLargeUrl from the image-pin fixture", () => {
    const payloads = parseRelayPayloads(imageHtml);
    const rec = findPinRecord(payloads);
    assert.ok(rec);
    const media = mediaFromPinRecord(rec.data);
    assert.ok(media.some((m) => m.kind === "image" && m.url.includes("i.pinimg.com")));
  });
  it("detects PinNotFound in the notfound fixture", () => {
    const payloads = parseRelayPayloads(notFoundHtml);
    const rec = findPinRecord(payloads);
    const d = rec?.data;
    assert.equal(d?.__typename, "PinNotFound");
  });
  it("skips unparseable relay blobs without throwing", () => {
    assert.ok(Array.isArray(parseRelayPayloads('window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("x", {truncated')));
  });
});

describe("download validation", () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(512)]);
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(512)]);
  const MP4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), Buffer.alloc(512)]);
  const HTML = Buffer.from("<!DOCTYPE html><html><body>error</body></html>" + "x".repeat(400));

  it("detects media signatures", () => {
    assert.equal(detectMediaType(PNG), "image/png");
    assert.equal(detectMediaType(JPG), "image/jpeg");
    assert.equal(detectMediaType(MP4), "video/mp4");
    assert.equal(detectMediaType(HTML), null);
  });
  it("accepts matching image content", () => {
    const t = validateDownloadedContent({ head: PNG, contentType: "image/png", bytesWritten: PNG.length, expect: "image" });
    assert.equal(t, "image/png");
  });
  it("accepts matching video content", () => {
    const t = validateDownloadedContent({ head: MP4, contentType: "video/mp4", bytesWritten: MP4.length, expect: "video" });
    assert.equal(t, "video/mp4");
  });
  it("rejects HTML as any media type", () => {
    assert.throws(
      () => validateDownloadedContent({ head: HTML, contentType: "text/html", bytesWritten: HTML.length, expect: "image" }),
      /HTML page/,
    );
  });
  it("rejects type mismatch (png served as video) by signature first", () => {
    // PNG magic wins over the declared content-type: signature check fires.
    assert.throws(
      () => validateDownloadedContent({ head: PNG, contentType: "image/png", bytesWritten: 600, expect: "video" }),
      /signature says image\/png but expected video/,
    );
  });
  it("rejects zero-byte downloads", () => {
    assert.throws(
      () => validateDownloadedContent({ head: Buffer.alloc(0), contentType: "", bytesWritten: 0, expect: "image" }),
      /0 bytes/,
    );
  });
  it("rejects empty-body responses by header", () => {
    assert.throws(
      () => validateResponseHeaders({ status: 200, headers: { "content-type": "image/png", "content-length": "0" }, expect: "image" }),
      /empty body/,
    );
  });
  it("rejects non-200 status", () => {
    assert.throws(() => validateResponseHeaders({ status: 404, headers: {}, expect: "image" }), /HTTP 404/);
  });
  it("rejects declared HTML content-type", () => {
    assert.throws(
      () => validateResponseHeaders({ status: 200, headers: { "content-type": "text/html" }, expect: "image" }),
      /text\/html/,
    );
  });
  it("rejects known-signature mismatch by declared type for unknown content", () => {
    // Unknown bytes declared as octet-stream while expecting an image:
    // the declared type is not image → rejected.
    assert.throws(
      () => validateDownloadedContent({ head: Buffer.alloc(600, 7), contentType: "application/octet-stream", bytesWritten: 600, expect: "image" }),
      /does not match expected image/,
    );
  });
  it("tolerates unknown-signature videos above min size, rejects below", () => {
    // below minBytes: rejected regardless of declared type
    assert.throws(
      () => validateDownloadedContent({ head: Buffer.alloc(100, 7), contentType: "video/mp4", bytesWritten: 100, expect: "video" }),
      /too small/,
    );
    // above minBytes with a plausible declared type: accepted
    const ok = validateDownloadedContent({ head: Buffer.alloc(600, 7), contentType: "video/mp4", bytesWritten: 600, expect: "video" });
    assert.equal(ok, "video/mp4");
  });
});

describe("media selection", () => {
  const pins = [
    { id: "1", title: "", media: [{ kind: "image", url: "a.jpg" }] },
    { id: "2", title: "", media: [{ kind: "image", url: "b.jpg" }, { kind: "video", container: "hls", url: "b.m3u8" }] },
    { id: "3", title: "", media: [{ kind: "video", container: "mp4", url: "c.mp4" }] },
  ];
  it("classifies pin kinds (video wins over poster image)", () => {
    assert.equal(pinKind(pins[0]), "image");
    assert.equal(pinKind(pins[1]), "video");
    assert.equal(pinKind(pins[2]), "video");
  });
  it("filters by type", () => {
    assert.equal(selectPinsByType(pins, "video").length, 2);
    assert.equal(selectPinsByType(pins, "image").length, 1);
  });
  it("builds download plans", () => {
    const plan = planDownloads(pins, "video");
    assert.equal(plan.length, 2);
    assert.equal(plan[0].media.url, "b.m3u8");
  });
  it("validates media type input", () => {
    assert.equal(requireMediaType("image"), "image");
    assert.throws(() => requireMediaType("audio"), /image/);
  });
});

describe("feed fixture normalization", () => {
  const feed = JSON.parse(fs.readFileSync(path.join(fixtureDir, "api/feed-page1.json"), "utf8"));
  it("normalizes every feed row with media", () => {
    const pins = feed.resource_response.data.map(normalizePin).filter(Boolean);
    assert.ok(pins.length >= 2, `expected >=2 pins, got ${pins.length}`);
    for (const pin of pins) {
      assert.ok(pin.id.length >= 15);
      assert.ok(pin.media.length >= 1);
    }
  });
});
