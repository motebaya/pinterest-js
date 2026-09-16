/**
 * Random trace id generator for B3 propagation headers.
 */

import crypto from "node:crypto";

/**
 * Generate a random 16-character lowercase hex string (B3 trace/span id).
 * @returns {string}
 */
export function getTraceId() {
  return crypto.randomBytes(8).toString("hex");
}
