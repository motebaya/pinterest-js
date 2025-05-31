#!/usr/bin/env node

/**
 * @github.com/motebaya - 5/6/2025
 * file: Utils.js`
 */

import readline from "readline";
import Helper from "./Helper.js";

class Utils {
  /***
   * wait for user confirm
   */
  static waitConfirm() {
    return new Promise((resolve) => {
      const s = ["⠋", "⠙", "⠸", "⠴", "⠦", "⠇"];
      let i = 0;
      const val = setInterval(() => {
        process.stdout.write(`\r${s[i % s.length]} ...`);
        i++;
      }, 100);
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      console.log("Enter to start download...");
      process.stdin.on("keypress", (str, key) => {
        if (key.name === "return") {
          clearInterval(val);
          process.stdout.write("\r....                  \n");
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve();
        }
      });
    });
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
