/**
 * HLS extractor for pinterest videos m3u8 to mp4
 * @github.com/motebaya - 5/20/2025
 * file: HLS.js
 */
import { parse } from "hls-parser";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import axios from "axios";
import chalk from "chalk";
import path from "path";

class HLS {
  static log = console.log;

  static setLogger(logFunc) {
    HLS.log = logFunc;
  }

  /**
   * normalize audio group id from best variant
   * @param {object} bestVariant
   * @return {string|null}
   */
  static _normalizeAudioGroupId(bestVariant) {
    /**
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

  /**
   * get best variant from hlsObj
   * @param {object} hlsObj
   * @param {string} hlsUrl
   * @return {object} { best, variantUrl, audioGroupId }
   */
  static getBestVariant({ hlsObj, hlsUrl }) {
    const variants = hlsObj.variants ?? [];
    if (!variants.length) {
      let msg = "No variants found in master playlist";
      HLS.log.error(msg);
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
    HLS.log.debug(
      `found best variant${chalk.white("::")}${chalk.white(best.resolution?.width)}x${chalk.white(best.resolution?.height)} @ ${chalk.white(best.bandwidth)}bps`,
    );

    HLS.log.debug(`variant url${chalk.white("::")}${chalk.white(variantUrl)}`);
    const audioGroupId = HLS._normalizeAudioGroupId(best);

    return { status: true, best, variantUrl, audioGroupId };
  }

  /**
   * get best audio rendition url
   * @param {object} hlsObj
   * @param {string} hlsUrl
   * @param {string|null} audioGroupId
   * @param {object} bestVariant
   * @return {object} { audioUrl, audio }
   */
  static getBestAudio({ hlsObj, hlsUrl, audioGroupId, bestVariant }) {
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
    HLS.log.debug(`found audio url: ${audioUrl}`);
    return { audioUrl, audio: pick };
  }

  /**
   * convert HLS m3u8 to mp4 using ffmpeg
   * @param {string} videoM3u8
   * @param {string|null} audioM3u8
   * @param {string} outputMp4
   * @return {Promise<boolean>}
   */
  static convertToMp4({ videoM3u8, audioM3u8, outputMp4 }) {
    HLS.log.info(
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
      HLS.log.debug(`ffmpeg args: ${args.join(" ")}`);

      const p = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });

      let err = "";
      p.stderr.on("data", (d) => {
        err += d.toString();
        if (HLS.log && HLS.log.level === "debug") {
          process.stderr.write(d);
        }
      });

      p.on("close", (code) => {
        if (code === 0) return resolve(true);
        reject(new Error(`ffmpeg failed (${code})\n${err}`));
      });
    });
  }

  /**
   * convert HLS m3u8 to mp4
   * @param {string} hlsUrl
   * @param {string} outputMp4
   * @return {Promise<{status: boolean, message?: string}>}
   */
  static async convert({ hlsUrl, outputMp4 }) {
    HLS.log.info(`Starting HLS conversion..`);
    try {
      HLS.log.debug(
        `Fetching HLS playlist: ${chalk.white(hlsUrl)} -> ${chalk.white(outputMp4)}`,
      );
      const resM3u8 = await axios.get(hlsUrl, { responseType: "text" });
      const hlsObj = parse(resM3u8.data);

      const { best, variantUrl, audioGroupId } = HLS.getBestVariant({
        hlsObj,
        hlsUrl,
      });

      const { audioUrl } = HLS.getBestAudio({
        hlsObj,
        hlsUrl,
        audioGroupId,
        bestVariant: best,
      });
      HLS.log.debug(
        `Merging video and audio streams into mp4:: video: ${variantUrl} audio: ${audioUrl} destination: ${outputMp4}`,
      );
      await HLS.convertToMp4({
        videoM3u8: variantUrl,
        audioM3u8: audioUrl,
        outputMp4,
      });

      return { status: true };
    } catch (e) {
      return { status: false, message: e?.message || String(e) };
    }
  }
}

export default HLS;
