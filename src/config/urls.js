/**
 * Pinterest URL constants and regexes.
 *
 * All Pinterest-specific string knowledge lives here (and in resources.js).
 * If Pinterest changes a page structure or route, this file + the parsers
 * are the only places that should need edits.
 */

export const HOST = "https://id.pinterest.com";
export const SHORT_HOST = "https://pin.it";
export const CDN_HOST = "i.pinimg.com";
export const VIDEO_CDN_HOST = "v1.pinimg.com";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

/**
 * Pin URL / ID forms:
 *   1) long   — https://<any>.pinterest.<tld>/pin/<16-21 digits>[/]
 *   2) short  — https://pin.it/<token>
 *   3) id     — bare 16-21 digit id
 */
export const PIN_URL =
  /^(?:https?:\/\/(?:www|\w+\.)?pinterest\.[a-z.]+\/pin\/(\d{16,21})\/?|https?:\/\/(?:www\.)?pin\.it\/([a-zA-Z0-9]+)\/?|(\d{16,21}))$/;

/** Pinterest username: 3-30 alnum/underscore, optional leading '@'. */
export const USERNAME = /^@?([a-zA-Z0-9_]{3,30})$/;

/** appVersion embedded in profile/pin page HTML. */
export const APP_VERSION = /['"]appVersion['"]\:['"](\w+?)['"]/;

/** userId extraction fallback chain (profile pages). */
export const USER_ID_1 = /['"]profile_cover['"]\:\{['"]id['"]\:['"](\d+?)['"]/i;
export const USER_ID_2 = /(?<=\/users\/)(\d+)(?=\/pins)/;
export const USER_ID_3 =
  /(?<=<script\s+[^>]*id="__PWS_INITIAL_PROPS__"\s+[^>]*type="application\/json">)(.*?)(?=<\/script>)/;

/**
 * Embedded relay payload on pin pages:
 * window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("payload", {json});
 */
export const RELAY_JSON =
  /window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\(\s*"(?:\\.|[^"\\])*"\s*,\s*(\{[\s\S]*?\})\s*\)\s*;?/g;

/** Build the profile page URL for a username. */
export const profileUrl = (username) => `${HOST}/${encodeURIComponent(username)}/`;

/** Build the pin page URL for a pin id. */
export const pinUrl = (pinId) => `${HOST}/pin/${pinId}/`;

/** Build an internal resource endpoint URL. */
export function resourceUrl({ resource, sourceUrl, data }) {
  return `${HOST}/resource/${resource}/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(data))}&_=${Date.now()}`;
}

/**
 * Parse a pin URL/ID into a stable descriptor.
 * @param {string} input
 * @returns {{ format: "long"|"short"|"id", id: string, url: string } | null}
 */
export function parsePinInput(input) {
  const m = PIN_URL.exec(String(input ?? "").trim());
  if (!m) return null;
  if (m[1]) return { format: "long", id: m[1], url: pinUrl(m[1]) };
  if (m[2]) return { format: "short", id: m[2], url: `${SHORT_HOST}/${m[2]}` };
  return { format: "id", id: m[3], url: pinUrl(m[3]) };
}

/**
 * Normalize a username (strip @). Returns null when invalid.
 * @param {string} input
 * @returns {string|null}
 */
export function parseUsername(input) {
  const m = USERNAME.exec(String(input ?? "").trim());
  return m ? m[1] : null;
}
