/**
 * Interactive CLI confirmation prompt for download actions
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: waitConfirm.js
 */

import readline from "node:readline";

/**
 * Prompt the user for a yes/no confirmation before proceeding.
 * Loops until a valid response ("y" or "n") is entered.
 *
 * @returns {Promise<boolean>} True if user confirmed, false if declined
 */
export async function waitConfirm() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let dl;
  for (;;) {
    dl = await new Promise((resolve) => {
      rl.question(" * Download? [y/n]: ", resolve);
    });

    dl = dl.trim().toLowerCase();
    if (dl === "y") {
      dl = true;
      break;
    } else if (dl === "n") {
      dl = false;
      break;
    }
  }

  rl.close();
  return dl;
}
