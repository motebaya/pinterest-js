/**
 * Pinterest session state: appVersion + userId resolved from the profile
 * page HTML, required by all resource endpoint calls.
 */

import {
  HOST,
  APP_VERSION,
  USER_ID_1,
  USER_ID_2,
  USER_ID_3,
  profileUrl,
} from "../../config/urls.js";
import { AppError } from "../../util/errors.js";

/**
 * Extract the initialReduxState userIds from the __PWS_INITIAL_PROPS__ JSON
 * (the USER_ID_3 fallback path).
 * @param {string} json
 * @returns {string|null}
 */
function userIdFromInitialProps(json) {
  try {
    const parsed = JSON.parse(json);
    const users = parsed?.initialReduxState?.users;
    if (!users) return null;
    const keys = Object.keys(users).filter((k) => k.length > 0);
    return keys[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve appVersion + userId for a username by scraping the profile page.
 * @param {import("axios").AxiosInstance} client
 * @param {{ username: string, log?: object }} p
 * @returns {Promise<{ appVersion: string, userId: string }>}
 * @throws {AppError} E_APP_VERSION / E_NETWORK
 */
export async function resolveProfileConfig(client, { username, log }) {
  const url = profileUrl(username);
  let html;
  try {
    const res = await client.get(url);
    if (res.status !== 200) {
      throw new AppError("E_NETWORK", `profile page returned HTTP ${res.status}`);
    }
    html = String(res.data ?? "");
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("E_NETWORK", `failed to fetch profile page for "${username}"`, { cause: err });
  }

  const appVersion = html.match(APP_VERSION)?.[1];
  let userId =
    html.match(USER_ID_1)?.[1] ??
    html.match(USER_ID_2)?.[1] ??
    null;

  if (!userId) {
    const props = html.match(USER_ID_3)?.[1];
    if (props) userId = userIdFromInitialProps(props);
  }

  if (!appVersion || !userId) {
    throw new AppError(
      "E_APP_VERSION",
      `could not find appVersion/userId on profile page of "${username}" — Pinterest page structure may have changed`,
    );
  }

  log?.debug?.(`resolved appVersion=${appVersion} userId=${userId}`, { scope: "Pinterest Session" });
  return { appVersion, userId };
}
