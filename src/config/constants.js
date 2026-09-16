/**
 * Application-wide constants — URLs, User-Agent, and default values
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: constants.js
 */

import { getTraceId } from "../utils/getTraceId.js";

/**
 * Pinterest URL endpoints used throughout the application.
 *
 * @type {{ host: string, shortHost: string, oembed: (pinId: string) => string }}
 */
export const URLS = {
  host: "https://id.pinterest.com",
  shortHost: "https://pin.it",

  /**
   * Build the oEmbed discovery URL for a given pin ID.
   *
   * @param {string} pinId - The Pinterest pin ID
   * @returns {string} Full oEmbed URL
   */
  oembed: (pinId) => {
    return `${URLS.host}/oembed.json?url=${URLS.host}/pin/${pinId}/&ref=oembed-discovery`;
  },
};

/**
 * Default User-Agent string used for all HTTP requests.
 *
 * @type {string}
 */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

/**
 * Resource Config for pinterest
 */
export const RS_CONFIG = {
  h: ({ appVersion, sourceUrl, pwsHandler }) => {
    const traceId = getTraceId();
    return {
      accept: "application/json, text/javascript, */*, q=0.01",
      "x-requested-with": "XMLHttpRequest",
      "sec-ch-ua-full-version-list":
        '"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="145.0.7632.76", "Chromium";v="145.0.7632.76"',
      "sec-ch-ua":
        '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      "sec-ch-ua-platform": "Windows",
      "sec-ch-ua-platform-version": '"19.0.0"',
      "x-pinterest-appstate": "active",
      referer: `${URLS.host}/`,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "accept-encoding": "gzip, deflate, br, zstd",
      "accept-language": "en-US,en;q=0.9,id;q=0.8,zh-CN;q=0.7,zh;q=0.6",
      "x-b3-flags": "0",
      "user-agent": USER_AGENT,
      priority: "u=1, i",
      "screen-dpr": "0.75",
      "x-app-version": appVersion,
      "x-b3-parentspanid": traceId,
      "x-b3-spanid": getTraceId(),
      "x-b3-traceid": traceId,
      "x-pinterest-pws-handler": pwsHandler,
      "x-pinterest-source-url": sourceUrl,
    };
  },
  "page.size": 25,
  builder: ({ q, sourceUrl, data }) => {
    return `${URLS.host}/resource/${q}/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(data))}&_=${Date.now()}`;
  },
  "user.feed": {
    locAuthor: (data) => {
      return {
        username: data[0]?.native_creator?.username,
        name: data[0]?.native_creator?.full_name,
        userId: data[0]?.native_creator?.id,
      };
    },
    mapfn: (data) => {
      return data
        .map((i) => {
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
        })
        .filter((i) => typeof i.title === "string");
    },
    pws: "www/[username].js",
    r: "UserActivityPinsResource",
    data: ({ username, userId }) => {
      if (!username || !userId) return null;
      return {
        sourceUrl: `/${username}/`,
        options: {
          exclude_add_pin_rep: true,
          field_set_key: "grid_item",
          is_own_profile_pins: false,
          redux_normalize_feed: true,
          user_id: userId,
          username: username,
        },
        context: {},
      };
    },
  },
  "user.board": {
    locAuthor: (data) => {
      return {
        username: data[0]?.owner?.username || "",
        name: data[0]?.owner?.full_name || "",
        userId: data[0]?.owner?.id || "",
      };
    },
    mapfn: (data) => {
      return data.map((i) => {
        return {
          id: i?.id || "",
          slug:
            i?.url
              .replace(/^\/|\/$/g, "")
              .split("/")
              .slice(-1)[0] || "",
          name: i?.name || "",
          url: i?.url || "",
          type: i?.type || "",
          owner: i?.owner?.username || "",
          pinCount: i?.pin_count || 0,
          coverImage: i?.image_cover_url || "",
        };
      });
    },
    pws: "www/[username]/_saved.js",
    r: "BoardsResource",
    data: ({ username }) => {
      if (!username) return null;
      return {
        sourceUrl: `/${username}/_saved/`,
        options: {
          privacy_filter: "all",
          sort: "last_pinned_to",
          field_set_key: "profile_grid_item",
          filter_stories: false,
          username: username,
          page_size: RS_CONFIG["page.size"],
          group_by: "visibility",
          include_archived: true,
          redux_normalize_feed: true,
          filter_all_pins: false,
        },
        context: {},
      };
    },
  },
  "user.board.section": {
    locAuthor: (data) => {
      return {
        username: null,
        name: null,
        userId: data[0]?.user?.id || null,
      };
    },
    mapfn: (data) => {
      return data.map((i) => {
        return {
          id: i?.id || "-",
          name: i?.title || "-",
          slug: i?.slug || "-",
          type: i?.type || "-",
          pinCount: i?.pin_count || 0,
        };
      });
    },
    pws: "www/[username]/[slug].js",
    r: "BoardSectionsResource",
    data: ({ boardId, username, slugBoard }) => {
      if (!boardId || !username || !slugBoard) return null;
      return {
        sourceUrl: `/${username}/${slugBoard}/`,
        options: {
          board_id: boardId,
          board_url: `/${username}/${slugBoard}/`,
          currentFilter: -1,
          field_set_key: "react_grid_pin",
          filter_section_pins: true,
          sort: "default",
          layout: "default",
          page_size: RS_CONFIG["page.size"],
          redux_normalize_feed: true,
        },
        context: {},
      };
    },
  },
  "user.board.sectionContent": {
    locAuthor: (data) => {
      return {
        username: data[0]?.pinner?.username || null,
        name: data[0]?.pinner?.full_name || null,
        userId: data[0]?.pinner?.id || null,
      };
    },
    get mapfn() {
      return RS_CONFIG["user.feed"].mapfn;
    },
    pws: "www/[username]/[slug]/[section_slug].js",
    r: "BoardSectionPinsResource",
    data: ({ sectionId, username, slugBoard, slugSection }) => {
      if (!sectionId || !username || !slugBoard || !slugSection) return null;
      return {
        sourceUrl: `/${username}/${slugBoard}/${slugSection}/`,
        options: {
          page_size: RS_CONFIG["page.size"],
          prepend: false,
          section_id: sectionId,
        },
        context: {},
      };
    },
  },
  "user.board.allContent": {
    get mapfn() {
      return RS_CONFIG["user.board.feed"].mapfn;
    },
    get locAuthor() {
      return RS_CONFIG["user.board.sectionContent"].locAuthor;
    },
    get pws() {
      return RS_CONFIG["user.board.section"].pws;
    },
    r: "BoardFeedResource",
    get data() {
      return RS_CONFIG["user.board.section"].data;
    },
  },
};

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  E_APP_VERSION: "No user id or app version found",
  E_NETWORK: "Network request failed",
  E_AUTH: "Authentication failed",
};
