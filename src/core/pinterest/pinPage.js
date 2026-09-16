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
 * @param {object[]} payloads
 * @returns {{ relayKey: string, data: object } | null}
 */
export function findPinRecord(payloads) {
  for (const payload of payloads) {
    for (const [key, record] of Object.entries(payload?.data ?? {})) {
      const d = record?.data;
      if (d && typeof d === "object" && (d.imageLargeUrl || d.storyPinData || d.videos || d.entityId)) {
        return { relayKey: key, data: d };
      }
    }
  }
  return null;
}

/**
 * Extract all media entries from a pin record (relay data).
 * @param {object} d pin record data
 * @returns {import("./types.js").Media[]}
 */
export function mediaFromPinRecord(d) {
  /** @type {import("./types.js").Media[]} */
  const media = [];

  // Image: prefer imageLargeUrl (largest served), then the images map.
  if (d.imageLargeUrl) {
    media.push({ kind: "image", url: d.imageLargeUrl });
  } else {
    const image = pickBestImage(d.images);
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
  const record = findPinRecord(payloads);

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

  const d = record.data;

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
