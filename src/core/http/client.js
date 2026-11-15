/**
 * HTTP layer: shared axios client with timeouts, B3 trace headers,
 * browser-like headers, and optional verbose logging interceptors.
 *
 * All Pinterest HTTP traffic goes through here (media downloads use
 * download/http.js which adds streaming + progress).
 */

import axios from "axios";
import * as AxiosLogger from "axios-logger";
import { HOST, USER_AGENT } from "../../config/urls.js";
import { getTraceId } from "../../util/trace.js";
import { asAppError } from "../../util/errors.js";

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Build the browser-imitating header set used for Pinterest XHR calls.
 * @param {{ appVersion: string, sourceUrl: string, pwsHandler: string }} p
 * @returns {Record<string,string>}
 */
export function pinterestHeaders({ appVersion, sourceUrl, pwsHandler }) {
  const traceId = getTraceId();
  return {
    accept: "application/json, text/javascript, */*, q=0.01",
    "x-requested-with": "XMLHttpRequest",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-full-version-list":
      '"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="145.0.7632.76", "Chromium";v="145.0.7632.76"',
    "sec-ch-ua-platform": "Windows",
    "sec-ch-ua-platform-version": '"19.0.0"',
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    "x-b3-flags": "0",
    "x-b3-parentspanid": traceId,
    "x-b3-spanid": getTraceId(),
    "x-b3-traceid": traceId,
    "x-pinterest-appstate": "active",
    "x-pinterest-pws-handler": pwsHandler,
    "x-pinterest-source-url": sourceUrl,
    "x-app-version": appVersion,
    referer: `${HOST}/`,
    "user-agent": USER_AGENT,
    priority: "u=1, i",
  };
}

/**
 * Create the shared client.
 * @param {{ verbose?: boolean, timeoutMs?: number }} [options]
 * @returns {import("axios").AxiosInstance}
 */
export function createHttpClient({ verbose = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const client = axios.create({
    headers: { "User-Agent": USER_AGENT },
    timeout: timeoutMs,
    maxRedirects: 5,
    // Pinterest serves JSON for resource endpoints; leave responseType default
    validateStatus: null, // we classify statuses ourselves
  });

  if (verbose) {
    AxiosLogger.setGlobalConfig({
      prefixText: false,
      status: true,
      headers: false,
      data: false,
    });
    client.interceptors.request.use(AxiosLogger.requestLogger, AxiosLogger.errorLogger);
    client.interceptors.response.use(AxiosLogger.responseLogger, AxiosLogger.errorLogger);
  }

  return client;
}

/**
 * Classify an axios error into an AppError with a stable code.
 * @param {unknown} err
 * @returns {import("../util/errors.js").AppError}
 */
export function classifyHttpError(err) {
  if (err?.code === "ECONNABORTED") {
    return asAppError(Object.assign(new Error("request timed out"), { cause: err }));
  }
  if (err?.response) {
    const status = err.response.status;
    if (status === 404) return asAppError(new Error(`HTTP 404 (not found)`));
    if (status === 403 || status === 401) return asAppError(new Error(`HTTP ${status} (blocked/expired)`));
    if (status === 429) return asAppError(new Error(`HTTP 429 (rate limited)`));
    return asAppError(new Error(`HTTP ${status}`));
  }
  if (err?.request) return asAppError(new Error(`no response: ${err.code ?? "network error"}`));
  return asAppError(err);
}
