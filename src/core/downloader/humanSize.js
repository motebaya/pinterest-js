/**
 * Convert byte sizes to human-readable format
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: humanSize.js
 */

/**
 * Convert a byte count into a human-readable string (e.g., "1.5 MB").
 *
 * @param {number} size - Size in bytes
 * @returns {string} Formatted size string with unit
 * @see https://stackoverflow.com/a/20732091
 */
export function humanSize(size) {
  var i = size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  return (
    (size / Math.pow(1024, i)).toFixed(2) * 1 +
    " " +
    ["B", "kB", "MB", "GB", "TB"][i]
  );
}
