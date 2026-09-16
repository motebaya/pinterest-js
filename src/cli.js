#!/usr/bin/env node

/**
 * CLI entry point.
 *
 * Modes:
 *   -u <user> --feed                 download from a user's created-pins feed
 *   -u <user> --board                interactive board/section selection download
 *   -p <pin url|id>                  download a single pin
 *   -c <username>                    re-download from cached user metadata
 *   -c <pinId>                       re-download a single pin from cached metadata
 */

import { ArgumentParser, RawTextHelpFormatter } from "argparse";
import chalk from "chalk";
import inquirer from "inquirer";
import { createLogger } from "./util/logger.js";
import { AppError } from "./util/errors.js";
import { parseUsername, parsePinInput } from "./config/urls.js";
import { DEFAULT_MAX_PAGES } from "./core/pinterest/pageSizes.js";
import { runUserPipeline, runPinPipeline, runCachedUserPipeline } from "./services/pipeline.js";

/**
 * Interactive board picker (inquirer checkbox, sorted by pin count).
 * @param {Array<{id:string,slug:string,name:string,pinCount:number}>} boards
 * @returns {Promise<Array<object>|null>}
 */
async function pickBoards(boards) {
  const sorted = boards.slice().sort((a, b) => b.pinCount - a.pinCount);
  const choices = sorted.map((b, i) => ({
    name: `${String(i + 1).padStart(2, "0")}. ${chalk.yellow(b.pinCount)} pins — ${b.name || b.slug || b.id}`,
    value: b,
  }));
  const answers = await inquirer.prompt([
    {
      type: "checkbox",
      name: "boards",
      message: "Select boards to download (space = select, a = all, enter = confirm):",
      pageSize: 12,
      choices,
    },
  ]);
  return answers.boards;
}

/**
 * Interactive per-board action prompt. Shown only for boards that have
 * sections.
 *
 * @param {object} board full board model (id/name/slug/pinCount)
 * @param {Array<{id:string,slug:string,name:string,pinCount:number}>} sections fetched sections of the board
 * @returns {Promise<"all"|"skip"|object[]>} "all" = whole board (incl. sections),
 *   "skip" = leave this board out, array = only the chosen sections
 */
async function pickBoardAction(board, sections) {
  const label = board?.name || board?.slug || board?.id || "(unknown board)";
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: `Board "${label}" has ${sections.length} section(s). Download:`,
      choices: [
        { name: "the whole board (pins + all sections)", value: "all" },
        { name: "only some sections…", value: "pick" },
        { name: "skip this board", value: "skip" },
      ],
    },
  ]);
  if (answers.mode === "all") return "all";
  if (answers.mode === "skip") return "skip";

  const sectionAnswers = await inquirer.prompt([
    {
      type: "checkbox",
      name: "sections",
      message: "Select sections (space = select, a = all, enter = confirm):",
      pageSize: 12,
      choices: sections.map((s) => ({
        name: `${chalk.yellow(s.pinCount)} pins — ${s.name || s.slug || s.id}`,
        value: s,
      })),
    },
  ]);
  return sectionAnswers.sections; // empty array = nothing selected → board skipped
}

const parser = new ArgumentParser({
  description: `      Pinterest Downloader\n   @github.com/motebaya — rebuilt`,
  formatter_class: RawTextHelpFormatter,
  prog: "pinterest-js",
});

parser.add_argument("-u", "--username", {
  type: "str",
  help: `pinterest username.\nexample: (${chalk.green("@anderson")}) or (${chalk.green("anderson")})`,
  metavar: "",
});
parser.add_argument("-p", "--pin", {
  type: "str",
  help: `pinterest post url or id.\nexample: (${chalk.green("https://www.pinterest.com/pin/123456789012345678/")})\nor: (${chalk.green("123456789012345678")})`,
  metavar: "",
});
parser.add_argument("-t", "--type", {
  type: "str",
  help: `media type to download, default: ${chalk.yellow("image")} (image, video)`,
  metavar: "",
  default: "image",
  choices: ["image", "video"],
});
parser.add_argument("-n", "--pages", {
  type: "int",
  help: `max pages to fetch per resource, default: ${chalk.red(String(DEFAULT_MAX_PAGES))} (25 pins per page)`,
  metavar: "",
  default: DEFAULT_MAX_PAGES,
});
parser.add_argument("-c", "--cache", {
  type: "str",
  help: "re-download from cached metadata instead of network extraction (<username> or <pinId>)",
  metavar: "",
});

const action = parser.add_argument_group("actions (one required for username mode)");
action.add_argument("-f", "--feed", {
  action: "store_true",
  help: "download media from the user's created-pins feed",
});
action.add_argument("-b", "--board", {
  action: "store_true",
  help: "interactive board and section selection download",
});

const flags = parser.add_argument_group("options");
flags.add_argument("-d", "--output-dir", {
  type: "str",
  help: `output root for downloads and metadata.\nexample: (${chalk.green("D:\\Downloads\\pinterest")}) — overrides ${chalk.yellow("PINTEREST_JS_OUTPUT_DIR")}`,
  metavar: "",
});
flags.add_argument("-m", "--metadata", {
  action: "store_true",
  help: "save pin/user metadata JSON next to downloads",
});
flags.add_argument("-o", "--overwrite", {
  action: "store_true",
  help: "re-download even when files already exist (default: skip)",
});
flags.add_argument("-y", "--yes", {
  action: "store_true",
  help: "skip the download confirmation prompt",
});
flags.add_argument("-V", "--verbose", {
  action: "store_true",
  help: "verbose (debug) output",
});

const args = parser.parse_args();

const log = createLogger({ level: args.verbose ? "debug" : "info" });

/**
 * One-line result summary including skip counts.
 * @param {{ downloaded: number, failed: number, skipped?: number }} result
 */
function logResult(result) {
  const parts = [`${result.downloaded} downloaded`];
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  parts.push(`${result.failed} failed`);
  log.success(`done: ${parts.join(", ")}`);
}

/**
 * Map AppError codes to process exit codes.
 */
function exitCodeFor(err) {
  if (err instanceof AppError) {
    switch (err.code) {
      case "E_USAGE":
      case "E_VALIDATION":
        return 2;
      case "E_ABORTED":
        return 130;
      default:
        return 1;
    }
  }
  return 1;
}

async function main() {
  const hasUser = Boolean(args.username);
  const hasPin = Boolean(args.pin);
  const hasCache = Boolean(args.cache);

  if (!hasUser && !hasPin && !hasCache) {
    parser.print_help();
    return 0;
  }

  const opts = {
    verbose: args.verbose,
    type: args.type,
    maxPages: Math.max(1, args.pages),
    metadata: args.metadata,
    overwrite: args.overwrite,
    yes: args.yes,
    cache: args.cache,
    outputDir: args.output_dir,
    log,
  };

  // Single pin mode
  if (hasPin && !hasUser) {
    const parsed = parsePinInput(args.pin);
    if (!parsed) {
      log.error(`invalid pin url or id: "${args.pin}"`);
      return 2;
    }
    const result = await runPinPipeline({ pinInput: args.pin }, opts);
    logResult(result);
    return result.failed > 0 ? 1 : 0;
  }

  // Cache modes
  if (hasCache && !hasUser) {
    const isPinId = /^\d{16,21}$/.test(args.cache);
    const result = isPinId
      ? await runPinPipeline({ pinInput: args.cache }, opts)
      : await runCachedUserPipeline({ username: args.cache }, opts);
    logResult(result);
    return result.failed > 0 ? 1 : 0;
  }

  // Username mode
  const username = parseUsername(args.username);
  if (!username) {
    log.error(`invalid username format: "${args.username}" (3-30 chars, letters/numbers/underscore)`);
    return 2;
  }
  if (!args.feed && !args.board) {
    log.error(`username mode requires an action: use ${chalk.green("--feed")} or ${chalk.green("--board")}`);
    return 2;
  }

  const result = await runUserPipeline(
    {
      username,
      mode: args.feed ? "feed" : "board",
      boardSelection: args.board ? pickBoards : undefined,
      sectionSelection: args.board ? pickBoardAction : undefined,
    },
    opts,
  );
  logResult(result);
  return result.failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    if (err instanceof AppError) {
      log.error(`${err.code}: ${err.message}`);
      process.exit(exitCodeFor(err));
    }
    if (err?.name === "ExitPromptError") {
      log.error("canceled by user");
      process.exit(130);
    }
    log.error(`unexpected error: ${err?.stack ?? err}`);
    process.exit(1);
  });
