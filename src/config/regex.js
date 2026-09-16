/**
 * Centralized regex patterns for Pinterest data extraction
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: regex.js
 */

/**
 * Matches Pinterest pin URLs in long, short, or ID-only format.
 * Groups: (1) long-form pin ID, (2) short-form token, (3) raw numeric ID
 *
 * @type {RegExp}
 */
export const PIN_URL =
  /^(?:https?:\/\/(?:www|\w+\.)?pinterest\.[a-z.]+\/pin\/(\d{16,21})\/?|https?:\/\/(?:www\.)?pin\.it\/([a-zA-Z0-9]+)\/?|(\d{16,21}))$/;

/**
 * Extracts the appVersion value from Pinterest HTML page source.
 *
 * @type {RegExp}
 */
export const APP_VERSION = /['"]appVersion['"]\:['"](\w+?)['"]/;

/**
 * Extracts user ID from Pinterest HTML — method 1 (profile_cover block).
 *
 * @type {RegExp}
 */
export const USER_ID_1 = /['"]profile_cover['"]\:\{['"]id['"]\:['"](\d+?)['"]/i;

/**
 * Extracts user ID from Pinterest HTML — method 2 (/users/<id>/pins path).
 *
 * @type {RegExp}
 */
export const USER_ID_2 = /(?<=\/users\/)(\d+)(?=\/pins)/;

/**
 * Extracts user ID from Pinterest HTML — method 3 (__PWS_INITIAL_PROPS__ script tag).
 *
 * @type {RegExp}
 */
export const USER_ID_3 =
  /(?<=\<script\s+[^>]*id\=\"__PWS_INITIAL_PROPS__\"\s+[^>]*type\=\"application\/json\">)(.*?)(?=\<\/script>)/;

/**
 * Extracts media data JSON from window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__ calls.
 * Named groups: payload, json
 *
 * @type {RegExp}
 */
export const MEDIA_DATA =
  /window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\(\s*"(?<payload>(?:\\.|[^"\\])*)"\s*,\s*(?<json>\{[\s\S]*?\})\s*\)\s*;?/;

/**
 * Validates Pinterest usernames: 3-30 chars, letters/numbers/underscores, optional leading '@'.
 *
 * @type {RegExp}
 */
export const USERNAME_ = /^@?[a-zA-Z0-9_]{3,30}$/;
