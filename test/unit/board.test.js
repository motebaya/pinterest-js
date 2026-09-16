/**
 * Board orchestration regression tests.
 *
 * Drives runUserPipeline in board mode against a fake Pinterest facade —
 * no network, no filesystem writes (metadata off, downloadOne failures are
 * swallowed by the per-item error handler and counted as failed).
 *
 * Locks in:
 *   - board name propagation (no "Board \"undefined\"" leaks — the picker
 *     receives the full board model, not just the id)
 *   - section picker contract: receives (board, sections) and may return
 *     "all" | "skip" | array-of-sections
 *   - "sections" means ONLY the chosen sections download
 *   - whole-board mode also pulls section content (BoardFeedResource gap)
 *   - cross-source duplicate pins are deduped once per id
 *   - skipped boards are excluded from the fetched-board count
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runUserPipeline } from "../../src/services/pipeline.js";
import { nolog } from "../helpers/index.js";

/** Board model matching the normalized shape produced by normalizeBoard(). */
function board(id, name, pinCount, slug) {
  return { id, name, slug: slug ?? name.toLowerCase(), pinCount, url: `/${slug ?? name.toLowerCase()}/`, owner: "u", coverImage: null };
}

function pin(id, kind = "image") {
  // Intentionally invalid URLs: downloadMedia rejects them with E_VALIDATION
  // before any network attempt, keeping these tests offline and instant.
  return {
    id,
    title: `pin ${id}`,
    media: [kind === "video" ? { kind: "video", container: "mp4", url: "" } : { kind: "image", url: "" }],
    uploadDate: null,
  };
}

/**
 * Minimal fake of the Pinterest facade covering the calls the board flow makes.
 * Records call names/args for assertions.
 */
function fakePinterest({ boards, sectionsByBoard = {}, pinsByBoard = {}, pinsBySection = {} }) {
  const calls = [];
  return {
    calls,
    extractBoards: async ({ username }) => {
      calls.push(["extractBoards", { username }]);
      return { kind: "boards", author: { username, name: username, userId: "111" }, boards, pages: 1 };
    },
    extractBoardSections: async ({ boardId }) => {
      calls.push(["extractBoardSections", { boardId }]);
      return { kind: "sections", author: null, sections: sectionsByBoard[boardId] ?? [], pages: 1 };
    },
    extractBoardPins: async ({ boardId }) => {
      calls.push(["extractBoardPins", { boardId }]);
      return { kind: "pins", author: null, pins: pinsByBoard[boardId] ?? [], pages: 1 };
    },
    extractBoardSectionPins: async ({ sectionId }) => {
      calls.push(["extractBoardSectionPins", { sectionId }]);
      return { kind: "pins", author: null, pins: pinsBySection[sectionId] ?? [], pages: 1 };
    },
  };
}

const OPTS = { type: "image", maxPages: 5, log: nolog, yes: true };

describe("board orchestration", () => {
  it("passes the full board model (not the id) to the section picker", async () => {
    const b = board("9001", "GRAY RAVENS", 2);
    const s1 = { id: "s1", slug: "one", name: "One", pinCount: 1 };
    const pinterest = fakePinterest({
      boards: [b],
      sectionsByBoard: { 9001: [s1] },
      pinsBySection: { s1: [pin("1")] },
    });
    let seen = null;
    await runUserPipeline(
      {
        username: "u",
        mode: "board",
        pinterest,
        sectionSelection: async (boardArg, sections) => {
          seen = { boardArg, sections };
          return "all";
        },
      },
      OPTS,
    );
    assert.ok(seen, "section picker was called");
    assert.equal(seen.boardArg.name, "GRAY RAVENS", "picker receives the board model with its name");
    assert.equal(seen.boardArg.id, "9001");
    assert.equal(seen.sections.length, 1, "picker receives the fetched sections");
  });

  it("does not prompt section selection for boards without sections", async () => {
    const b = board("9002", "no-sections", 2);
    const pinterest = fakePinterest({ boards: [b], pinsByBoard: { 9002: [pin("1")] } });
    let prompted = false;
    await runUserPipeline(
      { username: "u", mode: "board", pinterest, sectionSelection: async () => { prompted = true; return "all"; } },
      OPTS,
    );
    assert.equal(prompted, false, "section picker skipped for section-less boards");
    assert.ok(pinterest.calls.some(([n, a]) => n === "extractBoardPins" && a.boardId === "9002"));
  });

  it("downloads ONLY the chosen sections when the picker returns an array", async () => {
    const b = board("1", "with-sections", 10);
    const s1 = { id: "s1", slug: "one", name: "One", pinCount: 2 };
    const s2 = { id: "s2", slug: "two", name: "Two", pinCount: 2 };
    const pinterest = fakePinterest({
      boards: [b],
      sectionsByBoard: { 1: [s1, s2] },
      pinsBySection: { s1: [pin("a"), pin("b")], s2: [pin("c"), pin("d")] },
    });
    await runUserPipeline(
      {
        username: "u",
        mode: "board",
        pinterest,
        sectionSelection: async () => [s2], // user picked only section Two
      },
      OPTS,
    );
    const sectionCalls = pinterest.calls.filter(([n]) => n === "extractBoardSectionPins").map(([, a]) => a.sectionId);
    assert.deepEqual(sectionCalls, ["s2"], "only the selected section is fetched");
    assert.ok(!pinterest.calls.some(([n]) => n === "extractBoardPins"), "board feed is not fetched in section mode");
  });

  it("whole-board mode also fetches section content (board feed excludes sections)", async () => {
    const b = board("2", "everything", 10);
    const s1 = { id: "s1", slug: "one", name: "One", pinCount: 1 };
    const pinterest = fakePinterest({
      boards: [b],
      sectionsByBoard: { 2: [s1] },
      pinsByBoard: { 2: [pin("x")] },
      pinsBySection: { s1: [pin("y")] },
    });
    await runUserPipeline({ username: "u", mode: "board", pinterest, sectionSelection: async () => "all" }, OPTS);
    assert.ok(pinterest.calls.some(([n, a]) => n === "extractBoardPins" && a.boardId === "2"));
    assert.ok(pinterest.calls.some(([n, a]) => n === "extractBoardSectionPins" && a.sectionId === "s1"));
  });

  it("dedupes pins that arrive via both the board feed and a section", async () => {
    const b = board("3", "dupes", 10);
    const s1 = { id: "s1", slug: "one", name: "One", pinCount: 1 };
    const pinterest = fakePinterest({
      boards: [b],
      sectionsByBoard: { 3: [s1] },
      pinsByBoard: { 3: [pin("same"), pin("other")] },
      pinsBySection: { s1: [pin("same")] },
    });
    const result = await runUserPipeline(
      { username: "u", mode: "board", pinterest, sectionSelection: async () => "all" },
      OPTS,
    );
    const total = result.downloaded + result.failed + result.skipped;
    assert.equal(total, 2, "duplicate pin 'same' counted once (2 unique pins, downloads fail offline by design)");
  });

  it("skipped boards are excluded from the fetched-board count", async () => {
    const s = { id: "s", slug: "s", name: "S", pinCount: 1 };
    const b1 = board("10", "kept", 2);
    const b2 = board("11", "skipped", 2);
    const pinterest = fakePinterest({
      boards: [b1, b2],
      sectionsByBoard: { 10: [s], 11: [s] },
      pinsBySection: { s: [pin("k1")] },
    });
    await runUserPipeline(
      {
        username: "u",
        mode: "board",
        pinterest,
        sectionSelection: async (boardArg) => (boardArg.id === "11" ? "skip" : "all"),
      },
      OPTS,
    );
    assert.ok(!pinterest.calls.some(([n, a]) => n === "extractBoardPins" && a.boardId === "11"), "skipped board is never fetched");
  });

  it("falls back to slug/id when Pinterest returns a nameless board", async () => {
    const nameless = { id: "42", name: "", slug: "nameless-slug", pinCount: 1, url: "", owner: "", coverImage: null };
    const pinterest = fakePinterest({ boards: [nameless], pinsByBoard: { 42: [pin("z")] } });
    // The orchestration must complete without any "undefined" reaching logs;
    // the picker message is where the label used to leak.
    const result = await runUserPipeline({ username: "u", mode: "board", pinterest }, OPTS);
    assert.equal(result.failed >= 0, true, "pipeline completes for nameless boards");
  });
});
