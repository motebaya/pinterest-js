/**
 * Shared axios client factory and Pinterest constructor initialization
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: client.js
 */

import axios from "axios";
import * as AxiosLogger from "axios-logger";
import { createLogger } from "../../logger/index.js";
import { URLS, USER_AGENT } from "../../config/constants.js";

/**
 * Initialize the Pinterest client on `this` context.
 * Sets up: this.client, this.log, this.userData, this.numPages, this.verbose,
 * this.host, this.shortHost, this.oembed.
 *
 * Must be called with `.call(instance, verbose)` from the Pinterest constructor.
 *
 * @param {boolean} [verbose=false] - Enable debug logging and axios request/response logging
 * @returns {void}
 */
export function createClient(verbose = false) {
  this.verbose = verbose;
  this.host = URLS.host;
  this.shortHost = URLS.shortHost;
  this.oembed = URLS.oembed;
  this.userData = {
    pins: [],
    boards: [],
    boardSections: [],
    boardSectionsContent: {},
  };
  this.numPages = 1;
  this.log = createLogger({
    level: verbose ? "debug" : "info",
    longformat: false,
  });
  this.client = axios.create({
    headers: {
      "User-Agent": USER_AGENT,
    },
  });

  if (this.verbose) {
    AxiosLogger.setGlobalConfig({
      prefixText: false,
      status: true,
      headers: false,
      data: false,
      logger: this.log.debug.bind(this.log),
    });
    this.client.interceptors.request.use(
      AxiosLogger.requestLogger,
      AxiosLogger.errorLogger,
    );
    this.client.interceptors.response.use(
      AxiosLogger.responseLogger,
      AxiosLogger.errorLogger,
    );
  }
}
