#!/usr/bin/env node

/***
 * @github.com/motebaya - 5/6/2025
 * file: getPinMedia.js
 */

import axios from "axios";
import logger from "../logger/logging.js";
import Utils from "../Utils.js";
import * as AxiosLogger from "axios-logger";
import chalk from "chalk";
import Helper from "../Helper.js";
import fs from "fs";

class Pinterest {
  /**
   * Constructor
   */
  constructor(verbose = false) {
    this.verbose = verbose;
    this.host = Helper.URL.host;
    this.shortHost = Helper.URL.shortHost;
    this.oembed = Helper.URL.oembed;
    this.userData = {
      pins: [],
    };
    this.log = logger({
      level: verbose ? "debug" : "info",
      longformat: false,
    });
    this.client = axios.create({
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
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
        AxiosLogger.errorLogger
      );
      this.client.interceptors.response.use(
        AxiosLogger.responseLogger,
        AxiosLogger.errorLogger
      );
    }
  }

  /**
   * Get the config info
   * IDK, but sometimes appVersion might be changed
   *
   * @param {*} opts
   * @param {String} opts.username - The username of the user
   * @returns {Promise<Object>}
   */
  async getConfigInfo(opts) {
    return new Promise(async (resolve) => {
      try {
        const { username } = opts;
        this.log.debug(`getting version info for ${chalk.green(username)}`);
        let page = await this.client.get(`${this.host}/${username}`);
        page = page.data;
        const appVersion = page.match(Helper.REGEX.appVersion);
        let userId =
          page.match(Helper.REGEX.userId1) ??
          page.match(Helper.REGEX.userId2) ??
          page.match(Helper.REGEX.userId3);
        if (userId.includes("initialReduxState")) {
          userId = [
            "..",
            Object.keys(JSON.parse(userId[1]).initialReduxState.users).filter(
              (i) => i.length !== 0
            ),
          ];
        }
        if (userId && appVersion) {
          this.log.info(`appversion::${chalk.white(appVersion[1])}`);
          this.log.info(`userid::${chalk.white(userId[1])}`);
          this.userData.userId = userId[1];
          this.userData.appVersion = appVersion[1];
          return resolve({
            status: true,
          });
        }
        return resolve({
          status: false,
          message: "No user id or app version found",
        });
      } catch (error) {
        return resolve({
          status: false,
          message: error.message,
        });
      }
    });
  }

  /**
   * Get the user's pins
   *
   * @param {*} opts
   * @param {String} opts.username - The username of the user
   * @param {String} opts.bookmark - The bookmark of the user
   * @returns {Promise<Object>}
   */
  async getUserPin(opts) {
    return new Promise(async (resolve) => {
      try {
        const { username, bookmark } = opts;
        this.log.debug(`getting user pin's for ${chalk.green(username)}`);
        if (!this.userData.userId && !this.userData.appVersion) {
          const config = await this.getConfigInfo({ username });
          if (!config.status) {
            return resolve({
              status: false,
              message: config.message,
            });
          }
        }
        let data = {
          options: {
            exclude_add_pin_rep: true,
            field_set_key: "grid_item",
            is_own_profile_pins: false,
            redux_normalize_feed: true,
            user_id: this.userData.userId,
            username: username,
          },
          context: {},
        };
        if (bookmark) {
          data.options.bookmarks = [bookmark];
          this.log.info(
            `next page bookmark received::${chalk.yellow(bookmark)}`
          );
        }
        const urlTarget = `${
          this.host
        }/resource/UserActivityPinsResource/get/?source_url=${encodeURIComponent(
          `/${username}/`
        )}&data=${encodeURIComponent(JSON.stringify(data))}&_=${Date.now()}`;
        let page = await this.client.get(urlTarget, {
          headers: {
            "x-b3-spanid": Utils.getTraceId(),
            "sec-ch-ua-full-version-list":
              '"Google Chrome";v="135.0.7049.115", "Not-A.Brand";v="8.0.0.0", "Chromium";v="135.0.7049.115"',
            "sec-ch-ua-platform": "Windows",
            "x-b3-parentspanid": Utils.getTraceId(),
            "x-requested-with": "XMLHttpRequest",
            accept: "application/json, text/javascript, , q=0.01",
            "x-pinterest-source-url": `/${username}/`,
            "x-pinterest-appstate": "active",
            "x-pinterest-pws-handler": `www/[username].js`,
            "x-b3-traceid": Utils.getTraceId(),
            "x-app-version": this.userData.appVersion,
            "x-b3-flags": "0",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            referer: `${this.host}/`,
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "en-US,en;q=0.9,id;q=0.8",
          },
        });
        page = page.data?.resource_response;
        if (
          page.status.toLowerCase() === "success" &&
          page.code === 0 &&
          page.message.toLowerCase() === "ok"
        ) {
          if (page.data.length >= 1) {
            this.userData.pins.push(
              ...page.data.map((i) => {
                return {
                  title: i.title,
                  images: i?.images ?? [],
                  videos: i?.videos ?? [],
                  pinId: i.id,
                  uploadDate: i.created_at,
                };
              })
            );
            this.log.info(
              `items fetched::${chalk.yellow(this.userData.pins.length)}`
            );
          }
          if (this.userData.author === undefined) {
            this.userData.author = {
              username: page.data[0].native_creator.username,
              name: page.data[0].native_creator.full_name,
              userId: page.data[0].native_creator.id,
            };
          }

          if (page.bookmark !== undefined) {
            return resolve(
              await this.getUserPin({
                username,
                bookmark: page.bookmark,
              })
            );
          } else {
            this.log.info(
              `no more page found for ${chalk.white(
                username
              )} with last length: ${chalk.yellow(this.userData.pins.length)}`
            );
            return resolve({
              status: true,
              author: this.userData.author,
              result: this.userData.pins,
            });
          }
        } else {
          this.log.error(`no data found for::${chalk.white(username)}`);
          resolve({
            status: false,
            message: `no data found for ${username}`,
          });
        }
      } catch (error) {
        resolve({
          status: false,
          message: error.stack,
        });
      }
    });
  }

  /**
   * Get the images from the pin desktop webpage
   *
   * @param {*} opts
   * @param {String} opts.pinId - The id of the pin
   * @returns {Promise<Object>}
   */
  async getImages(opts) {
    return new Promise(async (resolve) => {
      try {
        let { pinId } = opts;
        pinId = Utils.isPinUrl(pinId);
        if (!pinId) {
          return resolve({
            status: false,
            message: "Invalid pin id or url",
          });
        }

        this.log.debug(
          `getting images from pin desktop webpage for ${chalk.white(pinId.id)}`
        );
        const page = await this.client.get(pinId.url);
        let metadata = page.data.match(Helper.REGEX.imageData);
        if (metadata) {
          this.log.info(
            `metadata length found for ${chalk.white(pinId.id)}::${chalk.yellow(
              metadata.length
            )}`
          );
          metadata = Object.values(
            JSON.parse(metadata[1] ?? metadata[2])?.response?.data ?? {}
          )[0]?.data;
          if (metadata?.imageSpec_orig !== undefined) {
            this.log.info(`image found for::${chalk.white(pinId.id)}`);
            return resolve({
              status: true,
              author: {
                username:
                  (metadata?.originPinner ?? metadata.pinner)?.username ?? "-",
                name:
                  (metadata?.originPinner ?? metadata.pinner)?.fullName ?? "-",
                userId:
                  (metadata?.originPinner ?? metadata.pinner)?.entityId ?? "-",
              },
              result: {
                title: metadata?.title ?? "-",
                url: metadata?.imageSpec_orig?.url,
                entityId: pinId.id,
              },
            });
          } else {
            this.log.error(`no image found for::${chalk.white(pinId.id)}`);
            return resolve({
              status: false,
              message: "No image found!",
              image: null,
            });
          }
        } else {
          return resolve({
            status: false,
            message: "No metadata found",
            image: null,
          });
        }
      } catch (error) {
        return resolve({
          status: false,
          message: error.message,
        });
      }
    });
  }

  /***
   * Get the videos from the pin desktop webpage
   *
   * @param {*} opts
   * @param {String} opts.pinId - The id of the pin
   * @returns {Promise<Object>}
   */
  async getVideos(opts) {
    return new Promise(async (resolve) => {
      try {
        let { pinId } = opts;
        pinId = Utils.isPinUrl(pinId);
        if (!pinId) {
          return resolve({
            status: false,
            message: "Invalid pin id or url",
          });
        }
        this.log.debug(
          `getting videos from pin desktop webpage for ${chalk.white(pinId.id)}`
        );
        let page = await this.client.get(pinId.url);
        let vData = new RegExp(Helper.REGEX.videoData).exec(page.data);
        if (vData) {
          this.log.info(
            `found relay response data for::${chalk.white(pinId.id)}::`
          );
          fs.writeFileSync(
            "vData.json",
            JSON.stringify(JSON.parse(vData[1]), null, 2)
          );
          vData = Object.values(JSON.parse(vData[1]).response.data)[0]?.data;

          if (vData) {
            this.log.info(
              `videoUrls found for::${chalk.white(
                pinId.id
              )}::total->${chalk.yellow(vData?.videos?.length ?? 0)}`
            );
            resolve({
              status: true,
              author: {
                username: vData?.pinner?.username ?? "-",
                name: vData?.closeupAttribution?.fullName ?? "-",
                userId: vData?.pinner?.entityId ?? "-",
              },
              result: vData?.videos ?? {},
            });
          } else {
            resolve({
              status: false,
              message: "no video data urls found!",
            });
          }
        } else {
          resolve({
            status: false,
            message: "couldn't find video data urls!",
          });
        }
      } catch (error) {
        return resolve({
          status: false,
          message: error.message,
        });
      }
    });
  }
}

export default Pinterest;
