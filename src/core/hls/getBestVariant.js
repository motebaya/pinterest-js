/**
 * Select the best HLS variant (highest resolution) from a master playlist
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: getBestVariant.js
 */

import chalk from "chalk";
import { normalizeAudioGroupId } from "./normalizeAudioGroupId.js";

/**
 * Get the best video variant from an HLS master playlist object.
 * Selects the variant with the highest resolution, falling back to bandwidth.
 *
 * @param {Object} params
 * @param {Object} params.hlsObj - Parsed HLS playlist object (from hls-parser)
 * @param {string} params.hlsUrl - Original HLS URL for resolving relative paths
 * @param {Object} params.log - Winston logger instance
 * @returns {{ status: boolean, best?: Object, variantUrl?: string, audioGroupId?: string|null, message?: string }}
 */
export function getBestVariant({ hlsObj, hlsUrl, log }) {
  const variants = hlsObj.variants ?? [];
  if (!variants.length) {
    const msg = "No variants found in master playlist";
    log.error(msg);
    return {
      status: false,
      message: msg,
    };
  }

  const best = variants.slice().sort((a, b) => {
    const ap = (a.resolution?.width ?? 0) * (a.resolution?.height ?? 0);
    const bp = (b.resolution?.width ?? 0) * (b.resolution?.height ?? 0);
    if (bp !== ap) return bp - ap;
    return (b.bandwidth ?? 0) - (a.bandwidth ?? 0);
  })[0];

  const variantUrl = new URL(best.uri, new URL(hlsUrl)).toString();
  log.debug(
    `found best variant${chalk.white("::")}${chalk.white(best.resolution?.width)}x${chalk.white(best.resolution?.height)} @ ${chalk.white(best.bandwidth)}bps`,
  );

  log.debug(`variant url${chalk.white("::")}${chalk.white(variantUrl)}`);
  const audioGroupId = normalizeAudioGroupId(best);

  return { status: true, best, variantUrl, audioGroupId };
}
