/**
 * Pinterest extractor — aggregates all extraction methods into a single class
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: index.js
 */

import { createClient } from "./client.js";
import { getConfigInfo } from "./getConfigInfo.js";
// import { getUserPin } from "./getUserPin.js";
import { getImages } from "./getImages.js";
import { getVideos } from "./getVideos.js";
import { extractUserResource } from "./getUserResources.js";

/**
 * Pinterest extractor class.
 * Holds shared state (client, logger, userData, pagination) and delegates
 * each extraction method to its own dedicated file via `.call(this, opts)`.
 */
class Pinterest {
  /**
   * Create a new Pinterest extractor instance.
   *
   * @param {boolean} [verbose=false] - Enable debug logging and axios interceptors
   */
  constructor(verbose = false) {
    createClient.call(this, verbose);
  }

  /**
   * Get config info (appVersion, userId) for a Pinterest user.
   *
   * @param {Object} opts
   * @param {string} opts.username - The Pinterest username
   * @returns {Promise<{ status: boolean, message?: string }>}
   */
  async getConfigInfo(opts) {
    return getConfigInfo.call(this, opts);
  }

  /**
   * Extract user resources (pins, boards, board sections, board contents)
   *
   * @param {Object} opts
   * @param {string} opts.username - The Pinterest username
   * @param {string} [opts.bookmark] - Pagination bookmark
   * username, fromResource,
   * @param {number} [opts.pages=100] - Max pages to fetch
   * @returns {Promise<{ status: boolean, author?: Object, result?: Array, message?: string }>}
   */
  async extractUserResource(opts) {
    return extractUserResource.call(this, opts);
  }

  // /**
  //  * Get all pins from a Pinterest user's profile with pagination.
  //  *
  //  * @param {Object} opts
  //  * @param {string} opts.username - The Pinterest username
  //  * @param {string} [opts.bookmark] - Pagination bookmark
  //  * @param {number} [opts.pages=100] - Max pages to fetch
  //  * @returns {Promise<{ status: boolean, author?: Object, result?: Array, message?: string }>}
  //  */
  // async getUserPin(opts) {
  //   return getUserPin.call(this, opts);
  // }

  // /**
  //  * Get all boards from a Pinterest user's profile with pagination.
  //  *
  //  * @param {Object} opts
  //  * @param {string} opts.username - The Pinterest username
  //  * @param {string} [opts.bookmark] - Pagination bookmark
  //  * @returns {Promise<{ status: boolean, author?: Object, result?: Array, message?: string }>}
  //  */
  // async getUserBoard(opts) {
  //   return getUserBoard.call(this, opts);
  // }

  // /**
  //  *
  //  * @param {Object} opts
  //  * @param {string} opts.username - The Pinterest username
  //  * @param {string} opts.boardId - The board ID
  //  * @param {string} opts.boardSlug - The board slug
  //  * @param {string} [opts.bookmark] - Pagination bookmark
  //  * @returns {Promise<{ status: boolean, author?: Object, result?: Array, message?: string }>}
  //  */
  // async getUserBoardSection(opts) {
  //   return getUserBoardSection.call(this, opts);
  // }

  // /**
  //  *
  //  * @param {Object} opts
  //  * @param {string} opts.username - The Pinterest username of the board owner
  //  * @param {string} opts.boardId - The ID of the board
  //  * @param {string} opts.boardSlug - The slug of the board
  //  * @param {string} [opts.bookmark] - Pagination bookmark from previous page
  //  * @returns {Promise<{ status: boolean, author?: Object, result?: Array, message?: string }>}
  //  */
  // async getUserBoardContent(opts) {
  //   return getUserBoardContent.call(this, opts);
  // }

  // /**
  //  *
  //  * @param {Object} opts
  //  * @param {string} opts.username - The Pinterest username of the board owner
  //  * @param {string} opts.boardId - The ID of the board
  //  * @param {string} opts.boardSlug - The slug of the board
  //  * @param {string} opts.sectionSlug - The slug of the section within the board
  //  * @param {string} [opts.bookmark] - Pagination bookmark from previous page
  //  * @returns {Promise<{ status: boolean, author?: Object, result?: Array, message?: string }>}
  //  */
  // async getBoardSectionContent(opts) {
  //   return getBoardSectionContent.call(this, opts);
  // }

  /**
   * Get image data from a single Pinterest pin.
   *
   * @param {Object} opts
   * @param {string} opts.pinId - Pinterest pin URL or ID
   * @returns {Promise<{ status: boolean, author?: Object, result?: Object, message?: string }>}
   */
  async getImages(opts) {
    return getImages.call(this, opts);
  }

  /**
   * Get video data from a single Pinterest pin.
   *
   * @param {Object} opts
   * @param {string} opts.pinId - Pinterest pin URL or ID
   * @returns {Promise<{ status: boolean, author?: Object, result?: Object, message?: string }>}
   */
  async getVideos(opts) {
    return getVideos.call(this, opts);
  }
}

export default Pinterest;
