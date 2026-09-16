/**
 * Extract video data from a Pinterest pin's desktop webpage
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: getVideos.js
 */

import chalk from "chalk";
import { isPinUrl } from "../../utils/isPinUrl.js";
import { MEDIA_DATA } from "../../config/regex.js";

/**
 * Get video data from a Pinterest pin by scraping the desktop webpage.
 * Parses the __PWS_RELAY_REGISTER_COMPLETED_REQUEST__ payload for video metadata.
 *
 * Must be called with `.call(pinterestInstance, opts)`.
 *
 * @param {Object} opts
 * @param {string} opts.pinId - Pinterest pin URL or ID
 * @returns {Promise<{ status: boolean, author?: Object, result?: Object, message?: string }>}
 */
export async function getVideos(opts) {
  try {
    let { pinId } = opts;
    pinId = isPinUrl(pinId);
    if (!pinId) {
      return {
        status: false,
        message: "Invalid pin id or url",
      };
    }
    this.log.debug(
      `getting videos from pin desktop webpage for ${chalk.white(pinId.id)}`,
    );
    let page = await this.client.get(pinId.url);
    let vData = page.data.match(MEDIA_DATA);
    if (!vData || vData[2] === undefined) {
      return {
        status: false,
        message: "couldn't find video data urls!",
      };
    }
    this.log.debug(`found video response data for::${chalk.white(pinId.id)}`);

    vData = JSON.parse(vData[2]);
    vData = vData.data[Object.keys(vData.data)[0]].data;
    if (!vData) {
      return {
        status: false,
        message: "no video data urls found!",
      };
    }

    let videos = vData.storyPinData.pages[0].blocks[0].videoDataV2;
    if (!videos?.videoList720P || !JSON.stringify(videos).includes("v720P")) {
      return {
        status: false,
        message: "couldn't find 720P video url!",
      };
    }

    videos = videos.videoList720P.v720P;
    this.log.debug(`videoUrls found for::${chalk.white(pinId.id)}`);
    return {
      status: true,
      author: {
        username: vData?.pinner?.username ?? "-",
        name: vData?.closeupAttribution?.fullName ?? "-",
        userId: vData?.pinner?.entityId ?? "-",
      },
      result: {
        title: vData?.title ?? "-",
        entityId: pinId.id,
        thumbnail: videos.thumbnail,
        url: videos.url,
      },
    };
  } catch (error) {
    return {
      status: false,
      message: error.message,
    };
  }
}
