/**
 * Central logger factory (winston).
 *
 * Levels (quiet → loud): error < warn < success < info < debug.
 * Normal CLI mode shows info and above with compact symbol prefixes.
 * Verbose mode (-V/--verbose) adds timestamps and scopes for diagnosis.
 *
 * Symbol conventions (kept consistent across the CLI):
 *   →  info / activity in progress
 *   ✓  success / completed
 *   ⚠  warning / skipped
 *   ✗  error
 *   ·  debug detail
 */

import winston from "winston";
import chalk from "chalk";

export const LOG_LEVELS = { error: 0, warn: 1, success: 2, info: 3, debug: 4 };

/** Prefix per level; info/notify renders plain so progress lines stay clean. */
const SYMBOL = {
  error: chalk.red("✗"),
  warn: chalk.yellow("⚠"),
  success: chalk.green("✓"),
  info: chalk.blue("→"),
  debug: chalk.gray("·"),
};

/**
 * @param {{ level?: "info"|"debug", longformat?: boolean }} [options]
 * @returns {winston.Logger}
 */
export function createLogger(options = {}) {
  const { level = "info", longformat = false } = options;
  const resolved = level === "info" ? "info" : "debug";

  const line = winston.format.printf(({ level, message, scope, timestamp }) => {
    if (resolved !== "debug") {
      return `${SYMBOL[level] ?? ""} ${message}`.trim();
    }
    const ts = timestamp ? chalk.gray(`${timestamp} `) : "";
    const sc = scope ? `${chalk.cyan(`<${scope}>`)} ` : "";
    return `${ts}${SYMBOL[level] ?? ""} ${sc}${message}`;
  });

  return winston.createLogger({
    levels: LOG_LEVELS,
    level: resolved,
    format: winston.format.combine(
      winston.format.timestamp({ format: "HH:mm:ss" }),
      line,
    ),
    transports: [new winston.transports.Console({ level: resolved })],
  });
}

/**
 * Null logger for library/test use — swallows all output.
 * Implements the same level set (including `success`).
 */
export function createNullLogger() {
  const noop = () => {};
  return Object.freeze({
    level: "info",
    error: noop,
    warn: noop,
    success: noop,
    info: noop,
    debug: noop,
  });
}
