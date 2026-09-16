/**
 * global error handlers
 * @github.com/motebaya - 2/20/2026 10:43AM
 * file: errors.js
 */

import { ERROR_MESSAGES as E_MSGS } from "../config/constants.js";

/**
 * Create a custom error with code and metadata
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @returns {Error} Custom error
 */
export function AppError(code, message) {
  const msg = message ?? E_MSGS[code] ?? "Unknown error";
  const err = new Error(msg);
  err.name =
    code
      .replace(/^E_/, "")
      .toLowerCase()
      .split("_")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("") + "Error";
  err.code = code;
  err.appError = true;

  Error.captureStackTrace?.(err, AppError);
  return err;
}
