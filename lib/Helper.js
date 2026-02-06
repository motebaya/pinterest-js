#!/usr/bin/node

/**
 * @github.com/motebaya - 5/20/2025
 * file: Helper.js
 */

class Helper {
  static URL = {
    host: "https://id.pinterest.com",
    shortHost: "https://pin.it",
    oembed: (u) => {
      return `${Helper.URL.host}/oembed.json?url=${Helper.URL.host}/pin/${u}/&ref=oembed-discovery`;
    },
  };

  /**
   * organized regex pattern
   */
  static REGEX = {
    pinUrl:
      /^(?:https?:\/\/(?:www|\w+\.)?pinterest\.[a-z.]+\/pin\/(\d{16,21})\/?|https?:\/\/(?:www\.)?pin\.it\/([a-zA-Z0-9]+)\/?|(\d{16,21}))$/,
    appVersion: /['"]appVersion['"]\:['"](\w+?)['"]/,
    userId1: /['"]profile_cover['"]:\{['"]id['"]\:['"](\d+?)['"]/i,
    userId2: /(?<=\/users\/)(\d+)(?=\/pins)/,
    userId3:
      /(?<=\<script\s+[^>]*id\=\"__PWS_INITIAL_PROPS__"\s+[^>]*type\=\"application\/json">)(.*?)(?=\<\/script>)/,
    mediaData:
      /window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\(\s*"(?<payload>(?:\\.|[^"\\])*)"\s*,\s*(?<json>\{[\s\S]*?\})\s*\)\s*;?/,
  };
}
export default Helper;
