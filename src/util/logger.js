/**
 * Central logger factory (winston).
 *
 * Levels: debug < info < warn < error. `-V/--verbose` maps to "debug".
 * Supports a `scope` metadata convention: log.info(msg, { scope: "Extract User Feed" }).
 */

import winston from "winston";
import chalk from "chalk";

const badge = {
  info: chalk.bgHex("#2563eb").white.bold(" INFO  "),
  debug: chalk.bgHex("#7c3aed").white.bold(" DEBUG "),
  warn: chalk.bgHex("#facc15").black.bold(" WARN  "),
  error: chalk.bgHex("#dc2626").white.bold(" ERROR "),
};

const levelize = winston.format((info) => {
  const level = info.level.toUpperCase();
  info.level = badge[level] ?? level;
  return info;
});

/**
 * @param {{ level?: "info"|"debug", longformat?: boolean }} [options]
 * @returns {winston.Logger}
 */
export function createLogger(options = {}) {
  const { level = "info", longformat = false } = options;
  const resolved = level === "info" ? "info" : "debug";
  return winston.createLogger({
    level: resolved,
    format: winston.format.combine(
      levelize(),
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: longformat ? "YYYY-MM-DD HH:mm:ss" : "HH:mm:ss" }),
      winston.format.printf(({ level, message, timestamp, scope }) => {
        const ts = chalk.white.dim(timestamp);
        const sc = scope ? `:${chalk.cyan.bold(`<${scope}>`)}` : "";
        return `${ts}:${level}${sc}:${message}\r`;
      }),
    ),
    transports: [new winston.transports.Console({ level: resolved })],
  });
}

/**
 * Null logger for library/test use — swallows all output.
 */
export function createNullLogger() {
  const noop = () => {};
  return { info: noop, debug: noop, warn: noop, error: noop, level: "info" };
}
