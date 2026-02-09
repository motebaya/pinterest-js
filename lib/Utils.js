#!/usr/bin/env node

/**
 * @github.com/motebaya - 5/6/2025
 * file: Utils.js`
 */

import readline from "readline";
import Helper from "./Helper.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

class Utils {
  /***
   * get default output path
   * @returns {String}
   */
  static getDefaultPath() {
    let defaultpath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../pinterest-downloader-output",
    );
    if (!fs.existsSync(defaultpath)) {
      fs.mkdirSync(defaultpath);
    }
    return defaultpath;
  }

  /***
   * wait for user confirm
   * @returns {Boolean}
   */

  static async waitConfirm() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let dl;
    for (;;) {
      dl = await new Promise((resolve) => {
        rl.question(" * Download? [y/n]: ", resolve);
      });

      dl = dl.trim().toLowerCase();
      if (dl === "y") {
        dl = true;
        break;
      } else if (dl === "n") {
        dl = false;
        break;
      }
    }

    rl.close();
    return dl;
  }

  /**
   * Generate a random hex64
   * - for spoofing: https://github.com/openzipkin/b3-propagation
   * wwww
   *
   * @returns {String}
   */
  static getTraceId() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      .toString(16)
      .padStart(16, "0");
  }

  /**
   * no built'in func title case.
   *
   * @param {string} string string.
   * @returns {string}
   */
  static toTitleCase(string) {
    return string.replace(/\w\S*/g, function (txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  /***
   * check if url is pinterest pin url
   *
   * @param {String} url url.
   * @returns {String|Boolean}
   */
  static isPinUrl(url) {
    let rUrl = Helper.REGEX.pinUrl.exec(url);
    if (rUrl) {
      const format = rUrl[1] ? "long" : rUrl[2] ? "short" : "id";
      return {
        format,
        id: rUrl[format === "long" ? 1 : format === "short" ? 2 : 3],
        url: format === "id" ? `${Helper.URL.host}/pin/${rUrl[3]}/` : url,
      };
    }
    return false;
  }
}
export default Utils;
