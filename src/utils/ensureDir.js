/**
 * Ensure a directory exists, creating it recursively if needed
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: ensureDir.js
 */

import fs from "node:fs";

/**
 * Create a directory if it does not already exist.
 * Uses recursive creation to handle nested paths.
 *
 * @param {string} dirPath - Absolute path to the directory
 * @returns {void}
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
