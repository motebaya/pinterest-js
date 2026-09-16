/**
 * Generic paginated Pinterest resource fetcher.
 *
 * Drives every entry in resources.js through bookmark-based pagination
 * with an explicit, bounded page limit. Never issues unbounded requests.
 */

import { resourceUrl, HOST } from "../../config/urls.js";
import { pinterestHeaders } from "../http/client.js";
import { AppError } from "../../util/errors.js";
import { getResource } from "./resources.js";
import { normalizePin, normalizeBoard, normalizeBoardSection } from "./normalize.js";

/** How rows are normalized per resource kind. */
const ROW_NORMALIZERS = {
  "user.feed": normalizePin,
  "board.sectionPins": normalizePin,
  "board.pins": normalizePin,
  "user.boards": normalizeBoard,
  "board.sections": normalizeBoardSection,
};

/**
 * Extract the bookmark token from a resource_response.
 * @param {object} resourceResponse
 * @returns {string|null}
 */
function bookmarkOf(resourceResponse) {
  const b = resourceResponse?.bookmark;
  if (typeof b === "string" && b.length > 0) return b;
  if (b && typeof b === "object" && typeof b.bookmark === "string") return b.bookmark;
  return null;
}

/**
 * Fetch pages of a resource until the bookmark chain ends or maxPages is hit.
 *
 * @param {import("axios").AxiosInstance} client
 * @param {object} p
 * @param {string} p.name resource key in RESOURCES
 * @param {object} p.opts resource-specific options ({username, userId, boardId, ...})
 * @param {{ appVersion: string, userId?: string }} p.session resolved profile config
 * @param {number} [p.maxPages=100] hard page cap; must be >= 1
 * @param {object} [p.log] logger
 * @returns {Promise<{ rows: object[], author: object, pages: number, bookmark: string|null }>}
 *   rows are normalized internal models (Pin[] / Board[] / BoardSection[])
 * @throws {AppError} E_RESOURCE, E_NO_DATA, E_NETWORK
 */
export async function fetchResource(client, { name, opts, session, maxPages = 100, log }) {
  const def = getResource(name);
  const normalizeRow = ROW_NORMALIZERS[name];
  const scope = `Fetch ${name}`;
  const hardMaxPages = Math.max(1, Math.floor(maxPages));

  /** @type {object[]} */
  const rows = [];
  let author = null;
  let bookmark = null;
  let pagesFetched = 0;

  while (pagesFetched < hardMaxPages) {
    const payload = def.payload({ ...opts, userId: opts.userId ?? session.userId });
    if (!payload) {
      throw new AppError("E_RESOURCE", `missing required options for resource "${name}"`);
    }
    const sourceUrl = def.sourceUrl(opts);
    if (bookmark) payload.options.bookmarks = [bookmark];

    const url = resourceUrl({ resource: def.resource, sourceUrl, data: payload });
    const headers = pinterestHeaders({
      appVersion: session.appVersion,
      sourceUrl,
      pwsHandler: def.pwsHandler,
    });

    log?.debug?.(`GET ${def.resource} (page ${pagesFetched + 1}/${hardMaxPages})`, { scope });
    let res;
    try {
      res = await client.get(url, { headers });
    } catch (err) {
      throw new AppError("E_NETWORK", `resource request failed: ${err.message}`, { cause: err });
    }

    if (res.status !== 200) {
      throw new AppError("E_NETWORK", `${def.resource} returned HTTP ${res.status}`);
    }

    const rr = res.data?.resource_response;
    if (!rr) {
      throw new AppError("E_NO_DATA", `${def.resource}: response has no resource_response envelope`);
    }

    const ok =
      rr.status === "success" || rr.code === 0 || String(rr.message ?? "").toLowerCase() === "ok";
    if (!ok) {
      throw new AppError(
        "E_NO_DATA",
        `${def.resource}: Pinterest returned status=${rr.status} code=${rr.code} message=${rr.message}`,
      );
    }

    const rawRows = Array.isArray(rr.data) ? rr.data : [];
    if (rawRows.length === 0) {
      log?.info?.(`no more rows for ${name}`, { scope });
      break;
    }

    for (const raw of rawRows) {
      const row = normalizeRow(raw);
      if (row) rows.push(row);
    }

    if (!author) {
      author = def.locAuthor(rawRows);
      if (!author?.username) author.username = opts.username ?? "";
      if (!author?.userId) author.userId = session.userId ?? "";
    }

    pagesFetched += 1;
    bookmark = bookmarkOf(rr);

    if (!bookmark) {
      log?.debug?.(`bookmark chain exhausted after ${pagesFetched} page(s)`, { scope });
      break;
    }
    if (pagesFetched >= hardMaxPages) {
      log?.info?.(`page limit reached (${hardMaxPages}); ${rows.length} rows collected`, { scope });
    }
  }

  return { rows, author, pages: pagesFetched, bookmark };
}

export { HOST };
