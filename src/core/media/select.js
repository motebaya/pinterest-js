/**
 * Media selection: turn internal Pin models into download decisions.
 */

import { AppError } from "../../util/errors.js";

/**
 * Determine a pin's primary media kind.
 * A pin with both image and video counts as the video (Pinterest pins
 * with video usually carry a poster image).
 * @param {import("../pinterest/types.js").Pin} pin
 * @returns {"image"|"video"|null}
 */
export function pinKind(pin) {
  if (pin.media.some((m) => m.kind === "video")) return "video";
  if (pin.media.some((m) => m.kind === "image")) return "image";
  return null;
}

/**
 * Select pins whose primary media kind matches the requested type.
 * @param {import("../pinterest/types.js").Pin[]} pins
 * @param {"image"|"video"} type
 * @returns {import("../pinterest/types.js").Pin[]}
 */
export function selectPinsByType(pins, type) {
  return pins.filter((p) => pinKind(p) === type);
}

/**
 * Build the download plan (one item per pin) for a media type.
 * @param {import("../pinterest/types.js").Pin[]} pins
 * @param {"image"|"video"} type
 * @returns {Array<{ pin: import("../pinterest/types.js").Pin, media: import("../pinterest/types.js").Media }>}
 */
export function planDownloads(pins, type) {
  const plan = [];
  for (const pin of pins) {
    const media = pin.media.find((m) => m.kind === type);
    if (media) plan.push({ pin, media });
  }
  return plan;
}

/**
 * Validate a requested type string.
 * @param {string} type
 * @returns {"image"|"video"}
 */
export function requireMediaType(type) {
  if (type === "image" || type === "video") return type;
  throw new AppError("E_VALIDATION", `media type must be "image" or "video", got "${type}"`);
}
