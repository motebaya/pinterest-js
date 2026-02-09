#!/usr/bin/node

/**
 * @github.com/motebaya - 5/8/2025
 * file: cli.js
 */

import { ArgumentParser, RawTextHelpFormatter } from "argparse";
import Main from "./main.js";

/**
 * cli handler
 */
(async () => {
  const parser = new ArgumentParser({
    description: "\tPin Ponggg \n   @github.com/motebaya - 2025",
    formatter_class: RawTextHelpFormatter,
  });

  parser.add_argument("-u", "--username", {
    type: "str",
    help: "pinterest username",
    metavar: "",
  });
  parser.add_argument("-p", "--pin", {
    type: "str",
    help: "pinterest post url or id",
    metavar: "",
  });
  parser.add_argument("-t", "--type", {
    type: "str",
    help: "type of media to download, default: image. (image, video)",
    metavar: "",
    default: "image",
    choices: ["image", "video"],
  });
  parser.add_argument("-c", "--cache", {
    type: "str",
    help: "using metadata from cache, <username> or <pinId> if exists",
    metavar: "",
  });
  parser.add_argument("-m", "--metadata", {
    action: "store_true",
    help: "save metadata to <output>/<id>/metadata.json",
  });
  parser.add_argument("-o", "--overwrite", {
    action: "store_true",
    help: "overwrite existing files",
  });
  parser.add_argument("--pages", {
    type: "int",
    help: "number of pages to download, default: 50",
    metavar: "",
    default: 50,
  });

  const group = parser.add_argument_group("Additional");
  group.add_argument("-V", "--verbose", {
    action: "store_true",
    help: "verbose output to console",
  });
  const args = parser.parse_args();
  if ((args.username || args.pin || args.cache) && args.type) {
    await new Main(args.verbose).extract({
      username: args.username,
      pinId: args.pin,
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
