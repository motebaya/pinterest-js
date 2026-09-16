import fs from "node:fs";
import path from "node:path";

/**
 * Create a directory (recursively) if missing.
 * @param {string} dirPath
 */
export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Strip Windows-forbidden characters and control chars from a filename.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
}

/**
 * Atomically move a finished temp file into its final location.
 * Uses rename when possible; falls back to copy+unlink across devices.
 * @param {string} tmpPath
 * @param {string} finalPath
 */
export function atomicMove(tmpPath, finalPath) {
  ensureDir(path.dirname(finalPath));
  try {
    fs.renameSync(tmpPath, finalPath);
  } catch (err) {
    if (err.code === "EXDEV") {
      fs.copyFileSync(tmpPath, finalPath);
      fs.unlinkSync(tmpPath);
    } else {
      throw err;
    }
  }
}

/**
 * Delete a file if it exists; never throws for ENOENT.
 * @param {string} filePath
 * @returns {boolean} true if a file was removed
 */
export function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return false;
  }
}
