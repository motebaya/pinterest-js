/**
 * Extract image data from a Pinterest pin's desktop webpage
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: getImages.js
 */

import chalk from "chalk";
import { isPinUrl } from "../../utils/isPinUrl.js";
import { MEDIA_DATA } from "../../config/regex.js";

/**
 * Get image data from a Pinterest pin by scraping the desktop webpage.
 * Parses the __PWS_RELAY_REGISTER_COMPLETED_REQUEST__ payload for image metadata.
 *
 * Must be called with `.call(pinterestInstance, opts)`.
 *
 * @param {Object} opts
 * @param {string} opts.pinId - Pinterest pin URL or ID
 * @returns {Promise<{ status: boolean, author?: Object, result?: Object, message?: string }>}
 */
export async function getImages(opts) {
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
      `getting images from pin desktop webpage for ${chalk.white(pinId.id)}`,
    );
    let page = await this.client.get(pinId.url);
    page = page.data;
    let metadata = page.match(MEDIA_DATA);
    if (!metadata || metadata[2] === undefined) {
      return {
        status: false,
        message: "No metadata found",
        image: null,
      };
    }

    this.log.debug(
      `metadata length found for ${chalk.white(pinId.id)}::${chalk.yellow(
        metadata.length,
      )}`,
    );
    let data = JSON.parse(metadata[2]);
    metadata = data.data[Object.keys(data.data)[0]].data;

    if (!metadata?.imageLargeUrl) {
      return {
        status: false,
        message: `No image found for::${pinId.id}! `,
        image: null,
      };
    }

    return {
      status: true,
      author: {
        username: metadata?.pinner?.username ?? "-",
        name: metadata?.closeupAttribution?.fullName ?? "-",
        userId: metadata?.pinner?.entityId ?? "-",
      },
      result: {
        title: metadata?.title ?? "-",
        url: metadata?.imageLargeUrl ?? "-",
        entityId: pinId.id,
      },
      message: `image found for::${pinId.id}`,
    };
  } catch (error) {
    return {
      status: false,
      message: error.message,
    };
  }
}
