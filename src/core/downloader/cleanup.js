/**
 * SIGINT cleanup handler for incomplete downloads
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: cleanup.js
 */

import fs from "node:fs";
import fsp from "node:fs/promises";

/**
 * Path to the currently downloading file (may be incomplete on interrupt).
 * @type {string|undefined}
 */
let maybeIncomplete;

/**
 * Set the path of the file currently being downloaded.
 * If the process is interrupted, this file will be cleaned up.
 *
 * @param {string|undefined} filePath - Absolute path to the in-progress file
 * @returns {void}
 */
export function setIncompleteFile(filePath) {
  maybeIncomplete = filePath;
}

/**
 * Get the current incomplete file path.
 *
 * @returns {string|undefined}
 */
export function getIncompleteFile() {
  return maybeIncomplete;
}

/**
 * Register the SIGINT handler that cleans up incomplete downloads.
 * Should be called once at application startup.
 *
 * @returns {void}
 */
export function registerCleanup() {
  process.on("SIGINT", async () => {
    if (maybeIncomplete !== undefined) {
      if (fs.existsSync(maybeIncomplete)) {
        let retry = 5;
        while (--retry) {
          try {
            await fsp.unlink(maybeIncomplete);
            break;
          } catch (err) {
            if (err.code === "EBUSY") {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } else {
              break;
            }
          }
        }
      }
    }
    console.log("\nInterrupted, exiting...");
    process.exit(1);
  });
}
