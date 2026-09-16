/**
 * Winston logger factory with custom formatting
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: index.js
 */

import winston from "winston";
import chalk from "chalk";

const badge = {
  INFO: chalk.bgHex("#2563eb").white.bold("[INFO ]"),
  DEBUG: chalk.bgHex("#7c3aed").white.bold("[DEBUG]"),
  WARN: chalk.bgHex("#facc15").black.bold("[WARN ]"),
  ERROR: chalk.bgHex("#dc2626").white.bold("[ERROR]"),
};

const formatLogger = winston.format((info) => {
  const level = info.level.toUpperCase();
  info.level = badge[level] || level;
  return info;
});

/**
 * Create a configured Winston logger instance.
 *
 * @param {Object} [options={}]
 * @param {string} [options.level="info"] - Log level ("info" | "debug")
 * @param {boolean} [options.longformat=false] - Use full datetime format (YYYY-MM-DD HH:mm:ss)
 * @returns {winston.Logger} Configured Winston logger
 */
export function createLogger(options = {}) {
  const { level = "info", longformat = false } = options;
  const resolvedLevel = level === "info" ? level : "debug";

  return winston.createLogger({
    level: resolvedLevel,
    format: winston.format.combine(
      formatLogger(),
      winston.format.colorize({ all: true }),
      winston.format.timestamp({
        format: !longformat ? "HH:mm:ss" : "YYYY-MM-DD HH:mm:ss",
      }),
      winston.format.printf(({ level, message, timestamp, scope }) => {
        if (!scope) {
          return `${chalk.white.dim(timestamp)}:${level}:${message}\r`;
        }
        return `${chalk.white.dim(timestamp)}:${level}:${chalk.cyan.bold(`<${scope}>`)}:${message}\r`;
      }),
    ),
    transports: [
      new winston.transports.Console({
        level: resolvedLevel,
      }),
      new winston.transports.Http({ level: "http" }),
    ],
  });
}
