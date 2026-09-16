/**
 * Normalize the audio group ID from an HLS variant object
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: normalizeAudioGroupId.js
 */

/**
 * Extract a consistent audio group ID string from a variant's audio property.
 * Handles multiple formats: plain string, array of Renditions, or object with groupId.
 *
 * @param {Object} bestVariant - The selected HLS variant object
 * @returns {string|null} The audio group ID, or null if not found
 */
export function normalizeAudioGroupId(bestVariant) {
  /**
   * Possible shapes:
   * - string: "audio1"
   * - array of Rendition: [ { groupId: "audio1", ... } ]
   * - object: { groupId: "audio1", ... }
   */
  const a = bestVariant?.audio;

  if (!a) return null;
  if (typeof a === "string") return a;

  if (Array.isArray(a)) {
    const first = a[0];
    if (first && typeof first.groupId === "string") return first.groupId;
    return null;
  }

  if (typeof a === "object" && typeof a.groupId === "string") {
    return a.groupId;
  }

  const attrs = bestVariant?.attributes;
  if (attrs && typeof attrs.AUDIO === "string") return attrs.AUDIO;

  return null;
}
