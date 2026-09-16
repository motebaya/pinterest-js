#!/usr/bin/env node

/**
 * CLI entry point — argument parsing and main invocation
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: cli.js
 */

import { ArgumentParser, RawTextHelpFormatter } from "argparse";
import { USERNAME_ } from "./config/regex.js";
import Main from "./main.js";
import chalk from "chalk";

/**
 * Parse CLI arguments and invoke the main extraction pipeline.
 *
 * @returns {Promise<void>}
 */
(async () => {
  const parser = new ArgumentParser({
    description: "      Pinterest Downloader \n   @github.com/motebaya - 2025",
    formatter_class: RawTextHelpFormatter,
  });

  parser.add_argument("-u", "--username", {
    type: "str",
    help: `pinterest username.\nexample: (${chalk.green("@anderson")}) or (${chalk.green("anderson")})`,
    metavar: "",
  });
  parser.add_argument("-p", "--pin", {
    type: "str",
    help: `pinterest post url or id.\nexample: (${chalk.green("https://www.pinterest.com/pin/123456789012345678/")}) \nor: (${chalk.green("123456789012345678")}) \nor: (${chalk.green("https://pin.it/abcde123")})`,
    metavar: "",
  });
  parser.add_argument("-t", "--type", {
    type: "str",
    help: `type of media to download, default: ${chalk.yellow("image")}. (image, video)`,
    metavar: "",
    default: "image",
    choices: ["image", "video"],
  });

  parser.add_argument("-n", "--pages", {
    type: "int",
    help: `number of max pages to download, default: ${chalk.red("100")}`,
    metavar: "",
    default: 100,
  });

  parser.add_argument("-c", "--cache", {
    type: "str",
    help: "using metadata from cache, <username> or <pinId> if exists",
    metavar: "",
  });

  const action_group = parser.add_argument_group("Actions");
  action_group.add_argument("-f", "--feed", {
    action: "store_true",
    help: `download selected media type from user feed. (${chalk.green(":_created")})`,
  });
  action_group.add_argument("-b", "--board", {
    action: "store_true",
    help: `download selected media type from selected user boards. (${chalk.green(":_saved")})`,
  });
  action_group.add_argument("-m", "--metadata", {
    action: "store_true",
    help: `save metadata to ${chalk.green("<output>/<id>/metadata.json")} file`,
  });
  action_group.add_argument("-o", "--overwrite", {
    action: "store_true",
    help: `${chalk.red("overwrite")} existing files. default: skip existing files`,
  });

  const group = parser.add_argument_group("Additional");
  group.add_argument("-V", "--verbose", {
    action: "store_true",
    help: "verbose output to console",
  });
  const args = parser.parse_args();
  if (
    (args.username || args.pin || args.cache) &&
    args.type &&
    (args.feed || args.board)
  ) {
    if (!USERNAME_.test(args.username)) {
      parser.error(`invalid username format: ${args.username}`);
    }
    await new Main(args.verbose).extract({
      username: args.username,
      pinId: args.pin,
      toMethod: args.feed ? "feed" : args.board ? "board" : undefined,
      type: args.type,
      metadata: args.metadata,
      overwrite: args.overwrite,
      cache: args.cache,
      pages: args.pages,
    });
  } else {
    parser.print_help();
  }
})();
