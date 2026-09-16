/**
 * Top-level HLS conversion orchestrator — fetches m3u8, selects best streams, converts to MP4
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: convert.js
 */

import axios from "axios";
import { parse } from "hls-parser";
import chalk from "chalk";
import { getBestVariant } from "./getBestVariant.js";
import { getBestAudio } from "./getBestAudio.js";
import { convertToMp4 } from "./convertToMp4.js";

/**
 * Fetch an HLS master playlist, select the best video+audio streams,
 * and convert them to MP4 via ffmpeg.
 *
 * @param {Object} params
 * @param {string} params.hlsUrl - URL of the HLS master playlist
 * @param {string} params.outputMp4 - Absolute path for the output MP4 file
 * @param {Object} params.log - Winston logger instance
 * @returns {Promise<{ status: boolean, message?: string }>}
 */
export async function convert({ hlsUrl, outputMp4, log }) {
  log.info(`Starting HLS conversion..`);
  try {
    log.debug(
      `Fetching HLS playlist: ${chalk.white(hlsUrl)} -> ${chalk.white(outputMp4)}`,
    );
    const resM3u8 = await axios.get(hlsUrl, { responseType: "text" });
    const hlsObj = parse(resM3u8.data);

    const { best, variantUrl, audioGroupId } = getBestVariant({
      hlsObj,
      hlsUrl,
      log,
    });

    const { audioUrl } = getBestAudio({
      hlsObj,
      hlsUrl,
      audioGroupId,
      bestVariant: best,
      log,
    });
    log.debug(
      `Merging video and audio streams into mp4:: video: ${variantUrl} audio: ${audioUrl} destination: ${outputMp4}`,
    );
    await convertToMp4({
      videoM3u8: variantUrl,
      audioM3u8: audioUrl,
      outputMp4,
      log,
    });

    return { status: true };
  } catch (e) {
    return { status: false, message: e?.message || String(e) };
  }
}
