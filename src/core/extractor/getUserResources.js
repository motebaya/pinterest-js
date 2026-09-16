/**
 * get user boards list
 * @github.com/motebaya - 2026-02-15 10:30AM
 * file: getUserBoards.js
 */

import chalk from "chalk";
import { RS_CONFIG } from "../../config/constants.js";
import { AppError } from "../../utils/errors.js";
import { toTitleCase } from "../../utils/cliFormat.js";
/**
 * RULES & FLOW:
 * A board can be merged into a single board, but it does NOT merge the content from that single board.
 * Any board merged into a single board becomes a `board section`.
 * Each board can have more than one contributor.
 * Each {board, media} can be fetched based on the owner/contributor username.
 *
 * If {Not Logged In} -> the content of a merged board is fetched in full.
 * For example, if board `A` has 3 boards and 3 standalone media items,
 * and each of those 3 boards contains 2 standalone media items,
 * then the total media fetched would be: 3 + (3 * 2) = 9 media.
 *
 * If {Logged In} -> for boards that contain board sections,
 * only the standalone media from the parent board is returned,
 * excluding the content inside the board sections.
 * Using the {Not Logged In} example, only the 3 media items
 * from the parent board would be returned.
 *
 * A user content feed can be fetched completely.
 * Each page may contain a different number of items.
 */

/**
 * resource extractor
 *
 * @param {Object} opts - Options for extracting user resources
 * @param {string} opts.username - Username of the user
 * @param {string} opts.fromResource - Resource to extract
 * @param {number} opts.maxPages - Maximum number of pages to extract
 * @param {string} opts.sectionId - Section ID
 * @param {string} opts.slugBoard - Board slug
 * @param {string} opts.slugSection - Section slug
 * @param {string} opts.boardId - Board ID
 * @returns {Promise<Object>} - Object containing the extracted user resources
 */
export async function extractUserResource(opts) {
  try {
    let {
      username,
      fromResource,
      maxPages,
      sectionId,
      slugBoard,
      slugSection,
      boardId,
    } = opts || {};
    username = username.replace("@", "");
    const scope = toTitleCase(this.extractUserResource.name);
    const resourceFmt = chalk
      .bgHex("#334155")
      .white(` ${toTitleCase(fromResource)} `);
    if (!fromResource || !Object.keys(RS_CONFIG).includes(fromResource)) {
      throw AppError(
        "E_RESOURCE",
        chalk.red(
          `Resource target is required!, rec:: ${chalk.yellow(String(fromResource))}`,
        ),
      );
    }

    /**
     * begin execute yeah
     * !* AppVersion -> required.
     */
    if (!this.userData.appVersion) {
      const config = await this.getConfigInfo({ username });
      if (!config.status) {
        return {
          status: false,
          message: config.message,
        };
      }

      opts.userId = this.userData.userId;
    }

    /**
     * Extractor
     * All target resources use pagination based on the supplied `bookmark` value.
     * Using a loop with a break condition is likely better than a recursive function.
     */

    let resourceData = {
      result: [],
    };
    let pagesFetch = 0;
    let bookmarkNext = null;
    for (;;) {
      if (pagesFetch >= maxPages) {
        this.log.info(
          `${resourceFmt}>max pages reached::${chalk.white(maxPages)}`,
          { scope },
        );
        break;
      }

      const r = RS_CONFIG[fromResource];
      let data = r.data(opts);
      /**
       * sometime data missing to sent from args
       */
      if (!data) {
        throw AppError(
          "E_DATA",
          `no context data found from configs ${chalk.yellow(fromResource)}`,
        );
      }
      let sourceUrl = data.sourceUrl;
      delete data.sourceUrl;

      /**
       * next page bookmark check
       */
      if (bookmarkNext) {
        data.options.bookmarks = [bookmarkNext];
        this.log.debug(
          `${resourceFmt}>found next page::${chalk.yellow(bookmarkNext)}`,
          { scope },
        );
      }

      /**
       * resource parsing
       */
      this.log.debug(
        `${resourceFmt}>context received::${JSON.stringify(data)}`,
        { scope },
      );
      let page = await this.client.get(
        RS_CONFIG.builder({
          q: r["r"],
          sourceUrl: sourceUrl,
          data: data,
        }),
        {
          headers: RS_CONFIG.h({
            appVersion: this.userData.appVersion,
            sourceUrl: sourceUrl,
            pwsHandler: r.pws,
          }),
        },
      );

      /**
       * no data bruh
       */
      page = page.data?.resource_response;
      if (
        page.status.toLowerCase() !== "success" &&
        page.code !== 0 &&
        page.message.toLowerCase().startsWith("ok")
      ) {
        throw AppError(
          "E_NODATA",
          `no data found for::${chalk.white(username)}`,
        );
      }

      /**
       * exit early dude
       */
      if (page.data.length < 1) {
        throw AppError(
          "E_EMPTY_DATA",
          `empty data returned from resource::${chalk.white(username)}`,
        );
      }

      /**
       * parsing data
       */
      resourceData.result.push(...r.mapfn(page.data));
      this.log.info(
        `${resourceFmt}>Pinterest data collected::${chalk.white(resourceData.result.length)}`,
        { scope },
      );

      /**
       * no next page check. no page? yeah stop.
       */
      if (!page.bookmark) {
        this.log.warn(
          `${resourceFmt}>no next page found::${chalk.white(username)}`,
          { scope },
        );
        this.log.warn(
          `${resourceFmt}>process stopped with last length::${chalk.white(resourceData.result.length)}`,
          { scope },
        );
        break;
      }

      /**
       * set next page bookmark
       */
      bookmarkNext = page.bookmark;

      /**
       * set author/pinner/owner data
       */
      if (!resourceData.author) {
        resourceData.author = r.locAuthor(page.data);
        if (!resourceData?.author?.username) {
          resourceData.author.username = username;
        }
        if (!resourceData?.author?.userId) {
          resourceData.author.userId = this.userData?.userId;
        }
      }

      /**
       * increment pages fetch
       */
      pagesFetch++;
    }

    return {
      status: true,
      ...resourceData,
    };
  } catch (error) {
    if (error.appError) {
      throw error;
    }
    return {
      status: false,
      message: error.stack,
    };
  }
}
