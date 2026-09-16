/**
 * Shared test helpers.
 *
 * - `nolog`: silent logger matching the winston-style interface used by src/.
 * - `withServer`: boots a local http.Server from a request handler so tests
 *   exercise the real downloader/HLS code paths without external network.
 */

import http from "node:http";
import { once } from "node:events";

/** Silent logger with the `{ level, debug, info, warn, error }` interface. */
export const nolog = Object.freeze({
  level: "info",
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

/**
 * Start a local HTTP server from a request handler.
 * @param {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void} handler
 * @returns {Promise<{ server: import("node:http").Server, url: string, close: () => Promise<void> }>}
 */
export async function withServer(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Read the full request body as a Buffer.
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
