/**
 * Convert HLS m3u8 streams to MP4 using ffmpeg subprocess
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: convertToMp4.js
 */

import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import path from "node:path";
import chalk from "chalk";

/**
 * Convert HLS m3u8 video (and optional audio) streams to MP4 using ffmpeg.
 * Spawns ffmpeg as a child process and streams stderr for debug logging.
 *
 * @param {Object} params
 * @param {string} params.videoM3u8 - URL of the video m3u8 playlist
 * @param {string|null} params.audioM3u8 - URL of the audio m3u8 playlist (null if embedded)
 * @param {string} params.outputMp4 - Absolute path for the output MP4 file
 * @param {Object} params.log - Winston logger instance
 * @returns {Promise<boolean>} Resolves true on success, rejects on ffmpeg failure
 */
export function convertToMp4({ videoM3u8, audioM3u8, outputMp4, log }) {
  log.info(
    `Converting HLS:{${chalk.white(videoM3u8.split("/").slice(-1)[0])},${chalk.white(audioM3u8?.split("/").slice(-1)[0])}} to MP4: ${chalk.white(path.basename(outputMp4))}`,
  );
  return new Promise((resolve, reject) => {
    const args = [
      "-loglevel",
      "verbose",
      "-y",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto",
    ];

    args.push("-i", videoM3u8);
    if (audioM3u8) args.push("-i", audioM3u8);

    if (audioM3u8) {
      args.push("-map", "0:v:0", "-map", "1:a:0");
    } else {
      args.push("-map", "0:v:0", "-map", "0:a?");
    }

    args.push(
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "+faststart",
      outputMp4,
    );
    log.debug(`ffmpeg args: ${args.join(" ")}`);

    const p = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });

    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
      if (log && log.level === "debug") {
        process.stderr.write(d);
      }
    });

    p.on("close", (code) => {
      if (code === 0) return resolve(true);
      reject(new Error(`ffmpeg failed (${code})\n${err}`));
    });
  });
}
