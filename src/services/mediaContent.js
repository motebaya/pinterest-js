/**
 * DRY: parsing from feed and board content
 * @github.com/motebaya - 2/15/2026 - 5:13PM
 * file: mediaContent.js
 */

/**
 * Parse media content from Pinterest API responses, handling both images and videos.
 * @param {Array} content - The content array to be parsed
 * @returns {Array} - The parsed media content array
 */
export function parseMediaContent(content) {
  if (!content) return [];
  return content
    .map((i) => {
      return {
        title: i.title,
        images: i?.images ?? [],
        videos: ((d) => {
          if (d.videos === null) {
            let loc = d.story_pin_data?.pages[0]?.blocks[0]?.video?.video_list;
            if (loc && !JSON.stringify(loc).toLowerCase().includes("v720p")) {
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
}
