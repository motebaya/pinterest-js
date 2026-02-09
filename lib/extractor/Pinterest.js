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
    this.numPages = 1;
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
        AxiosLogger.errorLogger,
      );
      this.client.interceptors.response.use(
        AxiosLogger.responseLogger,
        AxiosLogger.errorLogger,
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
    try {
      const { username } = opts;
      this.log.debug(`getting version info for ${chalk.green(username)}`);
      let page = await this.client.get(`${this.host}/${username}`);
      page = page.data;
      const appVersion = page.match(Helper.REGEX.appVersion);
      let userId =
        page.match(Helper.REGEX.userId1) ||
        page.match(Helper.REGEX.userId2) ||
        page.match(Helper.REGEX.userId3);
      if (userId.toString().includes("initialReduxState")) {
        userId = [
          "..",
          Object.keys(JSON.parse(userId[1]).initialReduxState.users).filter(
            (i) => i.length !== 0,
          )[0],
        ];
      }

      if (!userId || !appVersion) {
        return {
          status: false,
          message: "No user id or app version found",
        };
      }

      this.log.info(`appversion::${chalk.white(appVersion[1])}`);
      this.log.info(`userid::${chalk.white(userId[1])}`);
      this.userData.userId = userId[1];
      this.userData.appVersion = appVersion[1];
      return {
        status: true,
      };
    } catch (error) {
      return {
        status: false,
        message: error.message,
      };
    }
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
    try {
      const { username, bookmark, pages } = opts;
      this.log.info(
        `fetching user pages:: ${chalk.white(this.numPages)}/${chalk.white(
          pages,
        )}`,
      );
      this.log.debug(`getting user pin's for ${chalk.green(username)}`);
      if (!this.userData.userId && !this.userData.appVersion) {
        const config = await this.getConfigInfo({ username });
        if (!config.status) {
          return {
            status: false,
            message: config.message,
          };
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

      /**
       * next page bookmark
       */
      if (bookmark) {
        data.options.bookmarks = [bookmark];
        this.log.debug(`found next page::${chalk.yellow(bookmark)}`);
      }

      /**
       * user pins list
       */
      let page = await this.client.get(
        `${
          this.host
        }/resource/UserActivityPinsResource/get/?source_url=${encodeURIComponent(
          `/${username}/`,
        )}&data=${encodeURIComponent(JSON.stringify(data))}&_=${Date.now()}`,
        {
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
        },
      );
      page = page.data?.resource_response;
      if (
        page.status.toLowerCase() !== "success" &&
        page.code !== 0 &&
        page.message.toLowerCase() !== "ok"
      ) {
        this.log.error(`no data found for::${chalk.white(username)}`);
        return {
          status: false,
          message: `no data found for ${username}`,
        };
      }

      if (page.data.length >= 1) {
        this.userData.pins.push(
          ...page.data.map((i) => {
            return {
              title: i.title,
              images: i?.images ?? [],
              videos: ((d) => {
                if (d.videos === null) {
                  let loc =
                    d.story_pin_data?.pages[0]?.blocks[0]?.video?.video_list;
                  if (
                    loc &&
                    !JSON.stringify(loc).toLowerCase().includes("v720p")
                  ) {
                    let hls = loc?.V_HLSV3_MOBILE ?? loc?.V_HLSV4;
                    if (hls) {
                      loc.V_720P = {
                        url: hls.url,
                        width: hls.width,
                        height: hls.height,
                        duration: hls.duration,
                        thumbnail: hls.thumbnail,
                        need_convert: true,
                      };
                      return {
                        video_list: loc,
                      };
                    } else {
                      return null;
                    }
                  } else {
                    return {
                      video_list: loc,
                    };
                  }
                } else {
                  return d.videos;
                }
              })(i),
              pinId: i.id,
              uploadDate: i.created_at,
            };
          }),
        );
        this.log.info(
          `user pins fetched::${chalk.yellow(this.userData.pins.length)}`,
        );
      }
      if (this.userData.author === undefined) {
        this.userData.author = {
          username: page.data[0].native_creator.username,
          name: page.data[0].native_creator.full_name,
          userId: page.data[0].native_creator.id,
        };
      }

      if (this.numPages < pages) {
        if (page.bookmark !== undefined) {
          this.numPages++;
          let result = await this.getUserPin({
            username,
            bookmark: page.bookmark,
            pages,
          });
          return result;
        } else {
          this.log.info(
            `no more page found for ${chalk.white(
              username,
            )} with last length: ${chalk.yellow(this.userData.pins.length)}`,
          );
        }
      } else {
        this.log.info(
          `pages limit reached for ${chalk.white(
            username,
          )} with last length: ${chalk.yellow(this.userData.pins.length)}`,
        );
      }

      return {
        status: true,
        author: this.userData.author,
        result: this.userData.pins,
      };
    } catch (error) {
      return {
        status: false,
        message: error.stack,
      };
    }
  }

  /**
   * Get the images from the pin desktop webpage
   *
   * @param {*} opts
   * @param {String} opts.pinId - The id of the pin
   * @returns {Promise<Object>}
   */
  async getImages(opts) {
    try {
      let { pinId } = opts;
      pinId = Utils.isPinUrl(pinId);
      if (!pinId) {
        return {
          status: false,
          message: "Invalid pin id or url",
        };
      }

      this.log.debug(
        `getting images from pin desktop webpage for ${chalk.white(pinId.id)}`,
      );
      let page = await this.client.get(pinId.url);
      page = page.data;
      let metadata = page.match(Helper.REGEX.mediaData);
      if (!metadata || metadata[2] === undefined) {
        return {
          status: false,
          message: "No metadata found",
          image: null,
        };
      }

      this.log.debug(
        `metadata length found for ${chalk.white(pinId.id)}::${chalk.yellow(
          metadata.length,
        )}`,
      );
      let data = JSON.parse(metadata[2]);
      metadata = data.data[Object.keys(data.data)[0]].data;

      if (!metadata?.imageLargeUrl) {
        return {
          status: false,
          message: `No image found for::${pinId.id}! `,
          image: null,
        };
      }

      return {
        status: true,
        author: {
          username: metadata?.pinner?.username ?? "-",
          name: metadata?.closeupAttribution?.fullName ?? "-",
          userId: metadata?.pinner?.entityId ?? "-",
        },
        result: {
          title: metadata?.title ?? "-",
          url: metadata?.imageLargeUrl ?? "-",
          entityId: pinId.id,
        },
        message: `image found for::${pinId.id}`,
      };
    } catch (error) {
      return {
        status: false,
        message: error.message,
      };
    }
  }

  /***
   * Get the videos from the pin desktop webpage
   *
   * @param {*} opts
   * @param {String} opts.pinId - The id of the pin
   * @returns {Promise<Object>}
   */
  async getVideos(opts) {
    try {
      let { pinId } = opts;
      pinId = Utils.isPinUrl(pinId);
      if (!pinId) {
        return {
          status: false,
          message: "Invalid pin id or url",
        };
      }
      this.log.debug(
        `getting videos from pin desktop webpage for ${chalk.white(pinId.id)}`,
      );
      let page = await this.client.get(pinId.url);
      let vData = page.data.match(Helper.REGEX.mediaData);
      if (!vData || vData[2] === undefined) {
        return {
          status: false,
          message: "couldn't find video data urls!",
        };
      }
      this.log.debug(`found video response data for::${chalk.white(pinId.id)}`);

      vData = JSON.parse(vData[2]);
      vData = vData.data[Object.keys(vData.data)[0]].data;
      if (!vData) {
        return {
          status: false,
          message: "no video data urls found!",
        };
      }

      let videos = vData.storyPinData.pages[0].blocks[0].videoDataV2;
      if (!videos?.videoList720P || !JSON.stringify(videos).includes("v720P")) {
        return {
          status: false,
          message: "couldn't find 720P video url!",
        };
      }

      videos = videos.videoList720P.v720P;
      this.log.debug(`videoUrls found for::${chalk.white(pinId.id)}`);
      return {
        status: true,
        author: {
          username: vData?.pinner?.username ?? "-",
          name: vData?.closeupAttribution?.fullName ?? "-",
          userId: vData?.pinner?.entityId ?? "-",
        },
        result: {
          title: vData?.title ?? "-",
          entityId: pinId.id,
          thumbnail: videos.thumbnail,
          url: videos.url,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: error.message,
      };
    }
  }
}

export default Pinterest;
