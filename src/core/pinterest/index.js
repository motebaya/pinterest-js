/**
 * Pinterest facade — the single entry point for all extraction.
 *
 * Owns session state (appVersion/userId) and exposes:
 *   - extractPins({username, maxPages})      → user feed pins
 *   - extractBoards({username, maxPages})    → user boards
 *   - extractBoardSections({board})          → sections of one board
 *   - extractBoardSectionPins({board, section, maxPages})
 *   - extractBoardPins({board, maxPages})    → all pins of one board
 *   - extractPin({pinInput})                 → single pin by URL/id
 */

import { createHttpClient } from "../http/client.js";
import { resolveProfileConfig } from "./session.js";
import { fetchResource } from "./fetchResource.js";
import { fetchPin } from "./pinPage.js";
import { parsePinInput, parseUsername, profileUrl } from "../../config/urls.js";
import { AppError } from "../../util/errors.js";

export class Pinterest {
  /**
   * @param {{ verbose?: boolean, timeoutMs?: number, log?: object }} [options]
   */
  constructor({ verbose = false, timeoutMs, log } = {}) {
    this.client = createHttpClient({ verbose, timeoutMs });
    this.log = log;
    /** @type {{ appVersion: string, userId: string } | null} */
    this.session = null;
  }

  /**
   * Resolve (and cache) appVersion/userId for a username.
   * @param {string} username
   */
  async ensureSession(username) {
    if (!this.session) {
      this.session = await resolveProfileConfig(this.client, { username, log: this.log });
    }
    return this.session;
  }

  /** Drop cached session (used when switching users). */
  resetSession() {
    this.session = null;
  }

  /** Fetch a raw profile page (used by pin.it resolution). */
  async getPage(url) {
    const res = await this.client.get(url);
    if (res.status !== 200) {
      throw new AppError("E_NETWORK", `GET ${url} returned HTTP ${res.status}`);
    }
    return String(res.data ?? "");
  }

  /**
   * User feed pins (created pins + story pins).
   * @param {{ username: string, maxPages?: number }} p
   */
  async extractPins({ username, maxPages }) {
    const user = requireUsername(username);
    const session = await this.ensureSession(user);
    const out = await fetchResource(this.client, {
      name: "user.feed",
      opts: { username: user },
      session,
      maxPages,
      log: this.log,
    });
    return { kind: "pins", author: out.author, pins: dedupeById(out.rows), pages: out.pages };
  }

  /**
   * User boards.
   * @param {{ username: string, maxPages?: number }} p
   */
  async extractBoards({ username, maxPages }) {
    const user = requireUsername(username);
    const session = await this.ensureSession(user);
    const out = await fetchResource(this.client, {
      name: "user.boards",
      opts: { username: user },
      session,
      maxPages,
      log: this.log,
    });
    return { kind: "boards", author: out.author, boards: dedupeById(out.rows), pages: out.pages };
  }

  /**
   * Sections of one board.
   * @param {{ username: string, boardId: string, boardSlug: string, maxPages?: number }} p
   */
  async extractBoardSections({ username, boardId, boardSlug, maxPages }) {
    const user = requireUsername(username);
    const session = await this.ensureSession(user);
    const out = await fetchResource(this.client, {
      name: "board.sections",
      opts: { username: user, boardId, boardSlug },
      session,
      maxPages,
      log: this.log,
    });
    return { kind: "sections", author: out.author, sections: dedupeById(out.rows), pages: out.pages };
  }

  /**
   * Pins within one board section.
   * @param {{ username: string, boardId: string, boardSlug: string, sectionId: string, sectionSlug?: string, maxPages?: number }} p
   */
  async extractBoardSectionPins({ username, boardId, boardSlug, sectionId, sectionSlug, maxPages }) {
    const user = requireUsername(username);
    const session = await this.ensureSession(user);
    const out = await fetchResource(this.client, {
      name: "board.sectionPins",
      opts: { username: user, boardId, boardSlug, sectionId, sectionSlug },
      session,
      maxPages,
      log: this.log,
    });
    return { kind: "pins", author: out.author, pins: dedupeById(out.rows), pages: out.pages };
  }

  /**
   * All pins of one board.
   * @param {{ username: string, boardId: string, boardSlug: string, maxPages?: number }} p
   */
  async extractBoardPins({ username, boardId, boardSlug, maxPages }) {
    const user = requireUsername(username);
    const session = await this.ensureSession(user);
    const out = await fetchResource(this.client, {
      name: "board.pins",
      opts: { username: user, boardId, boardSlug },
      session,
      maxPages,
      log: this.log,
    });
    return { kind: "pins", author: out.author, pins: dedupeById(out.rows), pages: out.pages };
  }

  /**
   * Single pin by URL or id. Handles long URLs, bare ids, and pin.it
   * short links (resolved by fetching the short URL and following to the
   * canonical pin page).
   * @param {{ pinInput: string, log?: object }} p
   */
  async extractPin({ pinInput, log }) {
    const parsed = parsePinInput(pinInput);
    if (!parsed) {
      throw new AppError("E_PIN_INVALID", `"${pinInput}" is not a Pinterest pin URL or id`);
    }
    if (parsed.format === "short") {
      const canonical = await resolveShortLink(this.client, parsed.url, log);
      return fetchPin(this.client, { pinId: canonical, log });
    }
    return fetchPin(this.client, { pinId: parsed.id, log });
  }

  /**
   * Profile page URL for a username (for metadata display/tests).
   * @param {string} username
   */
  profileUrl(username) {
    return profileUrl(username);
  }
}

/**
 * Resolve a pin.it short link to a canonical pin id.
 * Strategy: GET the short URL (axios follows redirects); parse the final
 * URL for /pin/<id>/; if Pinterest redirects to the homepage instead
 * (invalid/expired token), parse the returned page's relay payloads as a
 * last resort. Throws E_PIN_NOT_FOUND when no pin id can be recovered.
 *
 * @param {import("axios").AxiosInstance} client
 * @param {string} shortUrl
 * @param {object} [log]
 * @returns {Promise<string>} pin id
 */
async function resolveShortLink(client, shortUrl, log) {
  let finalUrl = "";
  let html = "";
  try {
    const res = await client.get(shortUrl);
    finalUrl = res.request?.res?.responseUrl ?? "";
    html = String(res.data ?? "");
  } catch (err) {
    throw new AppError("E_NETWORK", `failed to resolve short link ${shortUrl}`, { cause: err });
  }

  const fromUrl = finalUrl.match(/\/pin\/(\d{16,21})/)?.[1];
  if (fromUrl) return fromUrl;

  // Invalid tokens land on the homepage with no pin data.
  const { parseRelayPayloads, findPinRecord } = await import("./pinPage.js");
  const record = findPinRecord(parseRelayPayloads(html));
  const fromRelay = record?.data?.entityId;
  if (fromRelay) return String(fromRelay);

  throw new AppError(
    "E_PIN_NOT_FOUND",
    `short link ${shortUrl} did not resolve to a pin (invalid or expired token)`,
  );
}

/**
 * @param {string} username
 * @returns {string}
 */
function requireUsername(username) {
  const user = parseUsername(username);
  if (!user) throw new AppError("E_VALIDATION", `invalid Pinterest username: "${username}"`);
  return user;
}

/**
 * Dedupe normalized rows by id, preserving order.
 * @template {{ id: string }} T
 * @param {T[]} rows
 * @returns {T[]}
 */
function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (row.id && seen.has(row.id)) continue;
    if (row.id) seen.add(row.id);
    out.push(row);
  }
  return out;
}

export default Pinterest;
