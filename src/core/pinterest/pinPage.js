/**
 * Pin-page extraction: fetch https://…/pin/<id>/ and parse the embedded
 * relay payloads (__PWS_RELAY_REGISTER_COMPLETED_REQUEST__) for pin data.
 *
 * Verified live 2026-09-16: image pins expose imageLargeUrl; video pins
 * (story/idea format) embed videoDataV2.videoList720P.v720P inside
 * storyPinData; deleted pins return __typename "PinNotFound".
 */

import { pinUrl, RELAY_JSON } from "../../config/urls.js";
import { AppError } from "../../util/errors.js";
import { pickBestImage, pickBestVideo, storyPinVideo, videoListFromVideoDataV2 } from "./normalize.js";

/**
 * Parse every relay JSON blob on an HTML page. Skips unparseable blobs.
 * @param {string} html
 * @returns {object[]}
 */
export function parseRelayPayloads(html) {
  /** @type {object[]} */
  const out = [];
  const rx = new RegExp(RELAY_JSON.source, "g");
  let m;
  while ((m = rx.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // relay blobs can be truncated by the non-greedy capture; skip
    }
  }
  return out;
}

/**
 * Walk relay payloads and find the first record whose data looks like a pin.
 * Accepts both success records (media fields) and error records
 * (`__typename: "PinNotFound"`) so callers can classify the outcome.
 * @param {object[]} payloads
 * @returns {{ relayKey: string, data: object } | null}
 */
export function findPinRecord(payloads) {
  for (const payload of payloads) {
    for (const [key, d] of Object.entries(pinRecordsFromPayload(payload))) {
      if (looksLikePinRecord(d)) return { relayKey: key, data: d };
    }
  }
  return null;
}

/**
 * Recognize a pin record (success or error shape).
 * @param {object} d
 * @returns {boolean}
 */
function looksLikePinRecord(d) {
  if (!d || typeof d !== "object") return false;
  if (
    d.imageLargeUrl ||
    d.storyPinData ||
    d.videos ||
    d.entityId ||
    // error-shaped pin records (deleted / invalid pins)
    d.__typename === "PinNotFound" ||
    d.__isError === "PinNotFound"
  ) {
    return true;
  }
  // flat images_* map shape (live SSR records)
  return Object.keys(d).some((k) => /^images_\w+$/.test(k) && d[k]?.url);
}

/**
 * Collect all pin-shaped records from one relay payload. Live SSR payloads
 * sometimes store the pin object directly under the relay key and sometimes
 * nested under `data` — handle both.
 * @param {object} payload
 * @returns {Record<string, object>} relayKey -> record data
 */
function pinRecordsFromPayload(payload) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const [key, record] of Object.entries(payload?.data ?? {})) {
    const d = record?.data ?? (looksLikePinRecord(record) ? record : null);
    if (d && typeof d === "object") out[key] = d;
  }
  return out;
}

/**
 * Collect the image map from a relay pin record. Live records expose flat
 * `images_<size>` keys (images_236x, images_736x, images_orig, …) while
 * older/alternate shapes nest them under `images`.
 * @param {object} d pin record data
 * @returns {Record<string, {url: string, width?: number, height?: number}>|null}
 */
function imageMapFromRecord(d) {
  if (d.images && typeof d.images === "object") return d.images;
  /** @type {Record<string, object>} */
  const map = {};
  for (const [key, value] of Object.entries(d)) {
    if (/^images_/.test(key) && value?.url) map[key.replace(/^images_/, "")] = value;
  }
  return Object.keys(map).length ? map : null;
}

/**
 * Extract all media entries from a pin record (relay data).
 * Carousel pins yield one image entry per carousel slot (in slot order).
 * @param {object} d pin record data
 * @returns {import("./types.js").Media[]}
 */
export function mediaFromPinRecord(d) {
  /** @type {import("./types.js").Media[]} */
  const media = [];

  // Carousel: one image per slot (slots carry their own images_* maps).
  const slots = d.carouselData?.carouselSlots ?? d.carousel_data?.carousel_slots;
  if (Array.isArray(slots) && slots.length > 0) {
    for (const slot of slots) {
      const img = pickBestImage(imageMapFromRecord(slot));
      if (img) media.push(img);
    }
    if (media.length > 0) return media;
  }

  // Image: prefer imageLargeUrl (largest served), then the images map.
  if (d.imageLargeUrl) {
    media.push({ kind: "image", url: d.imageLargeUrl });
  } else {
    const image = pickBestImage(imageMapFromRecord(d));
    if (image) media.push(image);
  }

  // Video: native video_list → videoDataV2 groups → story-pin block.
  let video = null;
  if (d.videos?.video_list) {
    video = pickBestVideo(d.videos.video_list);
  } else if (d.videos) {
    const merged = videoListFromVideoDataV2(d.videos);
    if (merged) video = pickBestVideo(merged);
  }
  if (!video) video = storyPinVideo(d);
  if (video) media.push(video);

  return media;
}

/**
 * Fetch a pin page and extract its media.
 *
 * @param {import("axios").AxiosInstance} client
 * @param {{ pinId: string, log?: object }} p
 * @returns {Promise<{ id: string, title: string, media: import("./types.js").Media[], author: {username: string, name: string, userId: string} }>}
 * @throws {AppError} E_PIN_NOT_FOUND, E_NO_MEDIA, E_NETWORK
 */
export async function fetchPin(client, { pinId, log }) {
  const url = pinUrl(pinId);
  log?.debug?.(`fetching pin page ${url}`, { scope: "Pin Page" });

  let html;
  try {
    const res = await client.get(url);
    if (res.status === 404) {
      throw new AppError("E_PIN_NOT_FOUND", `pin ${pinId} returned HTTP 404`);
    }
    if (res.status !== 200) {
      throw new AppError("E_NETWORK", `pin page returned HTTP ${res.status}`);
    }
    html = String(res.data ?? "");
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("E_NETWORK", `failed to fetch pin page ${pinId}`, { cause: err });
  }

  const payloads = parseRelayPayloads(html);
  // Prefer the richest pin record on the page: some SSR payloads carry the
  // full media set (images_*/carouselData) while others are media-less stubs.
  const candidates = payloads
    .map((payload) => Object.values(pinRecordsFromPayload(payload)))
    .flat()
    .filter((d) => looksLikePinRecord(d));
  const record =
    candidates.find((d) => mediaFromPinRecord(d).length > 0) ?? candidates[0] ?? null;

  if (!record) {
    // Distinguish a PinNotFound SSR response from an unparseable page.
    if (html.includes('"__typename":"PinNotFound"') || html.includes('"__isError":"PinNotFound"')) {
      throw new AppError("E_PIN_NOT_FOUND", `pin ${pinId} does not exist (deleted or invalid)`);
    }
    throw new AppError(
      "E_NO_DATA",
      `pin ${pinId}: no relay payload found — Pinterest page structure may have changed`,
    );
  }

  const d = record;

  if (d.__typename === "PinNotFound" || d.__isError === "PinNotFound") {
    throw new AppError("E_PIN_NOT_FOUND", `pin ${pinId} does not exist (deleted or invalid)`);
  }

  const media = mediaFromPinRecord(d);
  if (media.length === 0) {
    throw new AppError("E_NO_MEDIA", `pin ${pinId} has no downloadable media`);
  }

  return {
    id: String(d.entityId ?? pinId),
    title: typeof d.title === "string" && d.title ? d.title : (d.gridTitle ?? ""),
    media,
    author: {
      username: d.pinner?.username ?? d.native_creator?.username ?? "",
      name: d.closeupAttribution?.fullName ?? d.pinner?.full_name ?? d.native_creator?.full_name ?? "",
      userId: d.pinner?.entityId ?? d.pinner?.id ?? d.native_creator?.id ?? "",
    },
  };
}
