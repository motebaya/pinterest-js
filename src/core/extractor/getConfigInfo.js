/**
 * Fetch Pinterest app version and user ID from a profile page
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: getConfigInfo.js
 */

import chalk from "chalk";
import {
  APP_VERSION,
  USER_ID_1,
  USER_ID_2,
  USER_ID_3,
} from "../../config/regex.js";
import { toTitleCase } from "../../utils/cliFormat.js";
import { AppError } from "../../utils/errors.js";

/**
 * Get config info (appVersion, userId) for a Pinterest user.
 * Scrapes the user's profile page to extract appVersion and userId,
 * then stores them in this.userData for subsequent API calls.
 *
 * @param {Object} opts
 * @param {string} opts.username - The Pinterest username
 * @returns {Promise<{ status: boolean, message?: string }>}
 */
export async function getConfigInfo(opts) {
  try {
    const { username } = opts;
    const scope = toTitleCase(this.getConfigInfo.name);
    this.log.debug(`Fetching configs info`, { scope });
    let page = await this.client.get(`${this.host}/${username}`);
    page = page.data;
    const appVersion = page.match(APP_VERSION);
    let userId =
      page.match(USER_ID_1) || page.match(USER_ID_2) || page.match(USER_ID_3);
    if (userId.toString().includes("initialReduxState")) {
      userId = [
        "..",
        Object.keys(JSON.parse(userId[1]).initialReduxState.users).filter(
          (i) => i.length !== 0,
        )[0],
      ];
    }

    if (!userId || !appVersion) {
      throw AppError(
        "E_APP_VERSION",
        `cannot found AppVersion/UserId from username ${username}`,
      );
    }

    this.log.info(`Appversion::${chalk.white(appVersion[1])}`, { scope });
    this.log.info(`Userid::${chalk.white(userId[1])}`, { scope });
    this.userData.userId = userId[1];
    this.userData.appVersion = appVersion[1];
    return {
      status: true,
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
