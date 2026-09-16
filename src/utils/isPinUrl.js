/**
 * Validate and parse Pinterest pin URLs or numeric IDs
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: isPinUrl.js
 */

import { PIN_URL } from "../config/regex.js";
import { URLS } from "../config/constants.js";

/**
 * Check if a string is a valid Pinterest pin URL or numeric ID.
 * Returns a parsed object with format, id, and full URL — or false if invalid.
 *
 * @param {string} url - Pinterest URL or numeric pin ID
 * @returns {{ format: string, id: string, url: string } | false}
 */
export function isPinUrl(url) {
  const rUrl = PIN_URL.exec(url);
  if (rUrl) {
    const format = rUrl[1] ? "long" : rUrl[2] ? "short" : "id";
    return {
      format,
      id: rUrl[format === "long" ? 1 : format === "short" ? 2 : 3],
      url: format === "id" ? `${URLS.host}/pin/${rUrl[3]}/` : url,
    };
  }
  return false;
}
