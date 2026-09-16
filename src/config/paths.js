/**
 * Centralized output path resolver for pinterest-downloader
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: paths.js
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Name of the global output directory.
 * @type {string}
 */
const OUTPUT_DIR_NAME = "pinterest-downloader-output";

/**
 * Resolved project root (two levels up from src/config/).
 * @type {string}
 */
const PROJECT_ROOT = path.resolve(__dirname, "../..");

/**
 * Get the global output directory path.
 * Creates the directory if it does not exist.
 *
 * @returns {string} Absolute path to the output directory
 */
export function getOutputDir() {
  const outputDir = path.join(PROJECT_ROOT, OUTPUT_DIR_NAME);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

/**
 * Get the output directory for a specific Pinterest user.
 *
 * @param {string} username - The Pinterest username (with or without @ prefix)
 * @returns {string} Absolute path to the user's output directory
 */
export function getUserOutputDir(username) {
  const normalized = username.startsWith("@") ? username : `@${username}`;
  return path.join(getOutputDir(), normalized);
}
