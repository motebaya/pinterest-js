/**
 * Generate a random hex64 trace ID for B3 propagation spoofing
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: getTraceId.js
 */

/**
 * Generate a random 16-character hex string for use as a trace/span ID.
 * Used for B3 propagation headers (x-b3-traceid, x-b3-spanid, x-b3-parentspanid).
 *
 * @returns {string} 16-character hex string
 * @see https://github.com/openzipkin/b3-propagation
 */
export function getTraceId() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
    .toString(16)
    .padStart(16, "0");
}
