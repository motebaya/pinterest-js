/**
 * Normalizers: raw Pinterest resource rows -> internal models.
 * Isolates every assumption about Pinterest response shapes.
 */

/**
 * Build a VideoMedia from a Pinterest video_list entry.
 * @param {{url?: string, width?: number, height?: number, duration?: number, thumbnail?: string}} entry
 * @returns {import("./types.js").VideoMedia|null}
 */
function videoFromEntry(entry) {
  if (!entry?.url) return null;
  const isHls = String(entry.url).toLowerCase().includes(".m3u8");
  return {
    kind: "video",
    container: isHls ? "hls" : "mp4",
    url: entry.url,
    thumbnail: entry.thumbnail,
    width: entry.width,
    height: entry.height,
    duration: entry.duration,
  };
}

/** Preference order for native (non-HLS) video renditions, best first. */
const MP4_PREFERENCE = ["V_720P", "V_960P", "V_480P", "V_360P", "V_HLSV4", "V_HLSV3_MOBILE"];

/**
 * Extract the video_list embedded in a videoDataV2 block (story/idea pins).
 * Live pages expose several rendition groups (videoList720P.v720P,
 * videoListMobile, videoListEXP*, v_hlsv4_video_list); we merge them all
 * and let pickBestVideo rank the entries.
 * @param {object} videoDataV2
 * @returns {Record<string, object>|null}
 */
export function videoListFromVideoDataV2(videoDataV2) {
  if (!videoDataV2 || typeof videoDataV2 !== "object") return null;
  /** @type {Record<string, object>} */
  const merged = {};
  for (const [group, entries] of Object.entries(videoDataV2)) {
    if (!entries || typeof entries !== "object") continue;
    if (entries.url) {
      merged[group] = entries;
      continue;
    }
    for (const [key, entry] of Object.entries(entries)) {
      if (entry?.url) merged[`${group}.${key}`] = entry;
    }
  }
  return Object.keys(merged).length ? merged : null;
}

/**
 * Pick the best video from a Pinterest video_list object.
 * Prefers native MP4 (V_720P et al.); falls back to HLS master playlists.
 * @param {Record<string, object>} videoList
 * @returns {import("./types.js").VideoMedia|null}
 */
export function pickBestVideo(videoList) {
  if (!videoList) return null;
  for (const key of MP4_PREFERENCE) {
    const v = videoFromEntry(videoList[key]);
    if (v && v.container === "mp4") return v;
  }
  // any mp4 at all
  for (const v of Object.values(videoList)) {
    const m = videoFromEntry(v);
    if (m && m.container === "mp4") return m;
  }
  // HLS fallback — prefer V_HLSV4 over V_HLSV3_MOBILE (newer master)
  const hls =
    videoFromEntry(videoList.V_HLSV4) ??
    videoFromEntry(videoList.V_HLSV3_MOBILE) ??
    // merged rendition groups (e.g. "videoList720P.v720P") — pick the largest
    Object.values(videoList)
      .map((v) => videoFromEntry(v))
      .filter((v) => v && v.container === "hls")
      .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0] ??
    null;
  return hls;
}

/**
 * Extract story-pin video (idea pins) from the deeply nested block structure.
 * @param {object} rawPin
 * @returns {import("./types.js").VideoMedia|null}
 */
export function storyPinVideo(rawPin) {
  // Relay pin records use camelCase storyPinData; resource rows use
  // snake_case story_pin_data. Handle both.
  const sp = rawPin?.storyPinData ?? rawPin?.story_pin_data;
  const block = sp?.pages?.[0]?.blocks?.[0];
  const list =
    (block?.video?.video_list ? videoListFromVideoDataV2(block.video) : null) ??
    videoListFromVideoDataV2(block?.videoDataV2);
  if (!list) return null;
  return pickBestVideo(list);
}

/**
 * Pick the highest-quality image from a Pinterest images object.
 * Prefers "orig"; falls back to largest pixel area.
 * @param {Record<string, {url: string, width?: number, height?: number}>|null} images
 * @returns {import("./types.js").ImageMedia|null}
 */
export function pickBestImage(images) {
  if (!images) return null;
  const orig = images.orig;
  if (orig?.url) return { kind: "image", url: orig.url, width: orig.width, height: orig.height };
  let best = null;
  let bestArea = -1;
  for (const entry of Object.values(images)) {
    const area = (entry?.width ?? 0) * (entry?.height ?? 0);
    if (entry?.url && area > bestArea) {
      best = entry;
      bestArea = area;
    }
  }
  return best ? { kind: "image", url: best.url, width: best.width, height: best.height } : null;
}

/**
 * Normalize a feed/section pin row into a Pin.
 * A pin yields one primary media entry (image if present, else video).
 * Pins with both (rare) yield two entries.
 * @param {object} raw
 * @returns {import("./types.js").Pin|null} null when the row has no usable media
 */
export function normalizePin(raw) {
  if (!raw || typeof raw !== "object") return null;
  const media = [];

  const image = pickBestImage(raw.images);
  if (image) media.push(image);

  const video =
    (raw.videos?.video_list ? pickBestVideo(raw.videos.video_list) : null) ??
    (raw.videos?.videoList ? videoListFromVideoDataV2(raw.videos) && pickBestVideo(videoListFromVideoDataV2(raw.videos)) : null) ??
    storyPinVideo(raw);
  if (video) media.push(video);

  if (media.length === 0) return null;

  return {
    id: String(raw.id ?? ""),
    title: typeof raw.title === "string" ? raw.title : "",
    media,
    uploadDate: raw.created_at,
  };
}

/**
 * Normalize a board row.
 * @param {object} raw
 * @returns {import("./types.js").Board}
 */
export function normalizeBoard(raw) {
  return {
    id: String(raw?.id ?? ""),
    slug: String(raw?.url ?? "").replace(/^\/|\/$/g, "").split("/").slice(-1)[0] || "",
    name: String(raw?.name ?? ""),
    url: String(raw?.url ?? ""),
    owner: String(raw?.owner?.username ?? ""),
    pinCount: Number(raw?.pin_count ?? 0),
    coverImage: raw?.image_cover_url,
  };
}

/**
 * Normalize a board section row.
 * @param {object} raw
 * @returns {import("./types.js").BoardSection}
 */
export function normalizeBoardSection(raw) {
  return {
    id: String(raw?.id ?? ""),
    slug: String(raw?.slug ?? ""),
    name: String(raw?.title ?? raw?.name ?? ""),
    pinCount: Number(raw?.pin_count ?? 0),
  };
}
