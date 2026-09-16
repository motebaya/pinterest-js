/**
 * Pinterest resource registry.
 *
 * Each entry describes one internal Pinterest endpoint:
 *   - resource:    the internal API resource name (used in /resource/<name>/get/)
 *   - pwsHandler:  the x-pinterest-pws-handler route string
 *   - sourceUrl(opts): the x-pinterest-source-url / source_url query value
 *   - payload(opts):   the request `data` object (options + context); returns null when opts are insufficient
 *   - locAuthor(pageData): extract author info from the first row
 *
 * The generic paginator in fetchResource.js drives these definitions.
 * Verified live 2026-09-16 (see reports/01-reconstruction.md).
 */

import { DEFAULT_PAGE_SIZE } from "./pageSizes.js";

/**
 * Shared user-feed style pin normalizer lives in ../normalize/pin.js; the
 * payload definitions here only describe *requests*.
 */

/** @type {Record<string, import("./types.js").ResourceDef>} */
export const RESOURCES = {
  "user.feed": {
    resource: "UserActivityPinsResource",
    pwsHandler: "www/[username].js",
    sourceUrl: ({ username }) => `/${username}/`,
    payload: ({ username, userId }) => {
      if (!username || !userId) return null;
      return {
        options: {
          exclude_add_pin_rep: true,
          field_set_key: "grid_item",
          is_own_profile_pins: false,
          redux_normalize_feed: true,
          user_id: userId,
          username,
        },
        context: {},
      };
    },
    locAuthor: (rows) => ({
      username: rows[0]?.native_creator?.username,
      name: rows[0]?.native_creator?.full_name,
      userId: rows[0]?.native_creator?.id,
    }),
  },

  "user.boards": {
    resource: "BoardsResource",
    pwsHandler: "www/[username]/_saved.js",
    sourceUrl: ({ username }) => `/${username}/_saved/`,
    payload: ({ username }) => {
      if (!username) return null;
      return {
        options: {
          privacy_filter: "all",
          sort: "last_pinned_to",
          field_set_key: "profile_grid_item",
          filter_stories: false,
          username,
          page_size: DEFAULT_PAGE_SIZE,
          group_by: "visibility",
          include_archived: true,
          redux_normalize_feed: true,
          filter_all_pins: false,
        },
        context: {},
      };
    },
    locAuthor: (rows) => ({
      username: rows[0]?.owner?.username ?? "",
      name: rows[0]?.owner?.full_name ?? "",
      userId: rows[0]?.owner?.id ?? "",
    }),
  },

  "board.sections": {
    resource: "BoardSectionsResource",
    pwsHandler: "www/[username]/[slug].js",
    sourceUrl: ({ username, boardSlug }) => `/${username}/${boardSlug}/`,
    payload: ({ username, boardId, boardSlug }) => {
      if (!username || !boardId || !boardSlug) return null;
      return {
        options: {
          board_id: boardId,
          board_url: `/${username}/${boardSlug}/`,
          currentFilter: -1,
          field_set_key: "react_grid_pin",
          filter_section_pins: true,
          sort: "default",
          layout: "default",
          page_size: DEFAULT_PAGE_SIZE,
          redux_normalize_feed: true,
        },
        context: {},
      };
    },
    locAuthor: (rows) => ({
      username: null,
      name: null,
      userId: rows[0]?.user?.id ?? null,
    }),
  },

  "board.sectionPins": {
    resource: "BoardSectionPinsResource",
    pwsHandler: "www/[username]/[slug]/[section_slug].js",
    sourceUrl: ({ username, boardSlug, sectionSlug }) => `/${username}/${boardSlug}/${sectionSlug}/`,
    payload: ({ sectionId }) => {
      if (!sectionId) return null;
      return {
        options: {
          page_size: DEFAULT_PAGE_SIZE,
          prepend: false,
          section_id: sectionId,
        },
        context: {},
      };
    },
    locAuthor: (rows) => ({
      username: rows[0]?.pinner?.username ?? null,
      name: rows[0]?.pinner?.full_name ?? null,
      userId: rows[0]?.pinner?.id ?? null,
    }),
  },

  "board.pins": {
    resource: "BoardFeedResource",
    pwsHandler: "www/[username]/[slug].js",
    sourceUrl: ({ username, boardSlug }) => `/${username}/${boardSlug}/`,
    payload: ({ username, boardId, boardSlug }) => {
      if (!username || !boardId || !boardSlug) return null;
      return {
        options: {
          board_id: boardId,
          board_url: `/${username}/${boardSlug}/`,
          currentFilter: -1,
          field_set_key: "react_grid_pin",
          filter_section_pins: true,
          sort: "default",
          layout: "default",
          page_size: DEFAULT_PAGE_SIZE,
          redux_normalize_feed: true,
        },
        context: {},
      };
    },
    locAuthor: (rows) => ({
      username: rows[0]?.pinner?.username ?? null,
      name: rows[0]?.pinner?.full_name ?? null,
      userId: rows[0]?.pinner?.id ?? null,
    }),
  },
};

/**
 * Look up a resource definition or throw a clear error.
 * @param {string} name
 * @returns {import("./types.js").ResourceDef}
 */
export function getResource(name) {
  const def = RESOURCES[name];
  if (!def) {
    throw new Error(
      `unknown resource "${name}" (known: ${Object.keys(RESOURCES).join(", ")})`,
    );
  }
  return def;
}
