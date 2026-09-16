/**
 * Convert a string to Title Case
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: toTitleCase.js
 */

import chalk from "chalk";
import boxen from "boxen";

/**
 * Convert a string to title case (first letter of each word capitalized).
 *
 * @param {string} string - The input string to convert
 * @returns {string} Title-cased string
 */
export function toTitleCase(string) {
  return string.replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

/**
 * Generate a hash code from a string (used for consistent color generation)
 * @param {string} str - The input string to hash
 * @returns {number} The computed hash code
 */
function toHex(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0; // convert to 32bit int
  }
  return (Math.abs(h) % 0xffffff).toString(16).padStart(6, "0");
}

/**
 * Generate a consistent hex color code from a string.
 * Uses the hash of the string to create a unique color.
 *
 * @param {string} str - The input string to generate a color for
 * @returns {string} A hex color code (e.g., "#a1b2c3")
 */
export const label = (text) =>
  chalk.bgHex(`#${toHex(text)}`).white.bold(` ${text} `);

/**
 *  Display content in a styled box with a title.
 *  The box is styled using the `boxen` library, with a title that has a background color derived from the title text.
 * @param {string} content - The content to display in the box
 * @param {string} title - The title for the box (used to generate a consistent background color)
 */
export const toBoxes = (content, title) => {
  return boxen(content, {
    title: chalk.bgHex(`#${toHex(title)}`).white.bold(` ${title} `),
    titleAlignment: "center",
    borderColor: "#2563EB",
    padding: 1,
    margin: 1,
  });
};
