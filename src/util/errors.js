/**
 * Typed application errors.
 *
 * Every error surfaced to the CLI is an AppError with a stable code,
 * so the CLI can map codes to exit codes and friendly messages.
 */

export const ERROR_CODES = {
  E_USAGE: "invalid usage",
  E_VALIDATION: "invalid input",
  E_NETWORK: "network request failed",
  E_TIMEOUT: "request timed out",
  E_APP_VERSION: "could not read Pinterest app version / user id",
  E_PIN_NOT_FOUND: "pin not found",
  E_PIN_INVALID: "invalid pin url or id",
  E_NO_MEDIA: "no downloadable media found",
  E_NO_DATA: "no data returned by Pinterest",
  E_RESOURCE: "unknown resource",
  E_DOWNLOAD: "download failed",
  E_VALIDATION_FAILED: "downloaded content failed validation",
  E_FILESYSTEM: "filesystem error",
  E_FFMPEG: "ffmpeg failed",
  E_ABORTED: "aborted by user",
};

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} [message] defaults to the code description
   * @param {{cause?: Error, details?: object}} [options]
   */
  constructor(code, message, options = {}) {
    super(message ?? ERROR_CODES[code] ?? code, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    if (options.details) this.details = options.details;
    Error.captureStackTrace?.(this, AppError);
  }
}

/**
 * Normalize any thrown value into an AppError (wraps unknowns as E_NETWORK style).
 * @param {unknown} err
 * @returns {AppError}
 */
export function asAppError(err) {
  if (err instanceof AppError) return err;
  const code = err?.code === "ECONNABORTED" ? "E_TIMEOUT" : "E_NETWORK";
  return new AppError(code, err?.message ?? String(err), { cause: err });
}
