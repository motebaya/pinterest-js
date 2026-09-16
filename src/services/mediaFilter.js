/**
 * Filter and normalize media items from Pinterest pin data
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: mediaFilter.js
 */

/**
 * Reduce raw pin results into a flat array of downloadable media items.
 * Each pin may produce an image entry, a video entry, or both.
 *
 * @param {Array<Object>} pins - Array of pin objects from getUserPin()
 * @returns {Array<{ u: string, t: string, p: string, i?: string, c?: boolean }>}
 *   - u: media URL
 *   - t: title
 *   - p: pin ID
 *   - i: thumbnail URL (present only for videos)
 *   - c: needs HLS conversion flag (present only for HLS videos)
 */
export function filterMedia(pins) {
  return pins.reduce((m, r) => {
    if (r.images) {
      m.push({
        u: r.images?.orig?.url,
        t: r.title,
        p: r.pinId,
      });
    }
    if (r.videos?.video_list) {
      m.push({
        u: r.videos?.video_list?.V_720P?.url,
        t: r.title,
        i: r.videos?.video_list?.V_720P?.thumbnail,
        p: r.pinId,
        c: r.videos?.video_list?.V_720P?.need_convert,
      });
    }
    return m;
  }, []);
}
