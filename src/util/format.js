import chalk from "chalk";
import boxen from "boxen";

/**
 * Convert a byte count into a human-readable string (e.g. "1.5 MB").
 * @param {number} size
 * @returns {string}
 */
export function humanSize(size) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3);
  return (size / 1024 ** i).toFixed(2) * 1 + " " + ["B", "kB", "MB", "GB"][i];
}

/**
 * Title-case a string.
 * @param {string} string
 * @returns {string}
 */
export function toTitleCase(string) {
  return string.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

/** Deterministic pastel color from a string (for stable labels). */
function colorOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `#${(Math.abs(h) % 0xffffff).toString(16).padStart(6, "0")}`;
}

/**
 * Styled content box with a colored title.
 * @param {string} content
 * @param {string} title
 * @returns {string}
 */
export function toBoxes(content, title) {
  return boxen(content, {
    title: chalk.bgHex(colorOf(title)).white.bold(` ${title} `),
    titleAlignment: "center",
    borderColor: "#2563EB",
    padding: 1,
    margin: 1,
  });
}
