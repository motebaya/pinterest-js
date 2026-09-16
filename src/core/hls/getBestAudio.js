/**
 * Select the best audio rendition URL from an HLS master playlist
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: getBestAudio.js
 */

/**
 * Get the best audio rendition URL from an HLS playlist.
 * Tries inline audio from variant first, then falls back to media list.
 *
 * @param {Object} params
 * @param {Object} params.hlsObj - Parsed HLS playlist object
 * @param {string} params.hlsUrl - Original HLS URL for resolving relative paths
 * @param {string|null} params.audioGroupId - Audio group ID to match
 * @param {Object} params.bestVariant - The selected best variant object
 * @param {Object} params.log - Winston logger instance
 * @returns {{ audioUrl: string|null, audio: Object|null }}
 */
export function getBestAudio({ hlsObj, hlsUrl, audioGroupId, bestVariant, log }) {
  const a = bestVariant?.audio;
  if (Array.isArray(a) && a[0]?.uri) {
    const audioUrl = new URL(a[0].uri, new URL(hlsUrl)).toString();
    return { audioUrl, audio: a[0] };
  }
  if (typeof a === "object" && a?.uri) {
    const audioUrl = new URL(a.uri, new URL(hlsUrl)).toString();
    return { audioUrl, audio: a };
  }

  const medias = hlsObj.medias ?? hlsObj.media ?? [];
  const audios = (medias || []).filter((m) => m.type === "AUDIO" && m.uri);

  if (!audios.length) return { audioUrl: null, audio: null };

  let pick = null;
  if (audioGroupId) pick = audios.find((m) => m.groupId === audioGroupId);
  if (!pick) pick = audios[0];

  const audioUrl = new URL(pick.uri, new URL(hlsUrl)).toString();
  log.debug(`found audio url: ${audioUrl}`);
  return { audioUrl, audio: pick };
}
