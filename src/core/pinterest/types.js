/**
 * Internal data models (JSDoc typedefs).
 *
 * Pinterest response JSON must never leak past core/pinterest/*.
 * Everything downstream consumes these shapes.
 *
 * @typedef {Object} Author
 * @property {string} username
 * @property {string} name
 * @property {string} userId
 *
 * @typedef {Object} ImageMedia
 * @property {"image"} kind
 * @property {string} url        highest-quality URL available
 * @property {string} [thumbnail]
 * @property {number} [width]
 * @property {number} [height]
 *
 * @typedef {Object} VideoMedia
 * @property {"video"} kind
 * @property {"mp4"|"hls"} container
 * @property {string} url        direct .mp4 or master .m3u8
 * @property {string} [thumbnail]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [duration] seconds
 *
 * @typedef {ImageMedia|VideoMedia} Media
 *
 * @typedef {Object} Pin
 * @property {string} id
 * @property {string} title
 * @property {Media[]} media
 * @property {string} [uploadDate]
 *
 * @typedef {Object} Board
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} url
 * @property {string} owner
 * @property {number} pinCount
 * @property {string} [coverImage]
 *
 * @typedef {Object} BoardSection
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {number} pinCount
 *
 * @typedef {Object} FeedPage
 * @property {Pin[]|Board[]|BoardSection[]} rows
 * @property {string|null} bookmark   next-page token, null when exhausted
 * @property {Author|null} author
 *
 * @typedef {Object} ResourceDef
 * @property {string} resource
 * @property {string} pwsHandler
 * @property {(opts: object) => string} sourceUrl
 * @property {(opts: object) => object|null} payload
 * @property {(rows: object[]) => Author} locAuthor
 */

export {};
