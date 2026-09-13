import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { launchDesktop } from "./desktop.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const desktopDataDirectory = (
  platform = process.platform,
  env = process.env,
  home = homedir(),
) => {
  if (env.LIGHTFLUX_DESKTOP_DATA_DIR) return env.LIGHTFLUX_DESKTOP_DATA_DIR;
  if (platform === "darwin")
    return join(
      home,
      "Library",
      "Application Support",
      "com.little1d.lightflux",
    );
  if (platform === "win32")
    return join(
      env.APPDATA ?? join(home, "AppData", "Roaming"),
      "com.little1d.lightflux",
    );
  return join(
    env.XDG_DATA_HOME ?? join(home, ".local", "share"),
    "com.little1d.lightflux",
  );
};

export const readLocalConnection = async (
  directory = desktopDataDirectory(),
) => {
  const path = join(directory, "local-api.json");
  let descriptor;
  try {
    const info = await stat(path);
    if (
      process.platform !== "win32" &&
      ((info.mode & 0o077) !== 0 || info.uid !== process.getuid())
    ) {
      throw new Error(
        "Local API credentials must be owned by this user with mode 0600.",
      );
    }
    descriptor = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(
        "Open LightFlux Desktop first. No login or cloud server is required.",
      );
    throw error;
  }
  const url = new URL(descriptor.apiUrl);
  if (
    descriptor.schemaVersion !== 1 ||
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    typeof descriptor.token !== "string" ||
    descriptor.token.length < 32
  ) {
    throw new Error(
      "Invalid local desktop connection. Restart LightFlux Desktop.",
    );
  }
  return { apiUrl: url.origin, token: descriptor.token };
};

// Descriptor absence means the desktop has never run / was quit; a 503 from
// the loopback layer means a stale descriptor points at a dead socket. Both
// are recoverable by launching the installed desktop and waiting.
const isRecoverableStartError = (error) =>
  error?.status === 503 ||
  (error instanceof Error && /Open LightFlux Desktop first/.test(error.message));

export const autostartDisabled = (env = process.env) =>
  env.LIGHTFLUX_NO_AUTOSTART === "1" ||
  env.LIGHTFLUX_NO_AUTOSTART === "true" ||
  env.CI === "true";

// Connects to the local desktop, starting it on demand. `probe` validates the
// connection with a real loopback call so a stale descriptor also triggers a
// relaunch and retry instead of an immediate failure.
export const connectLocalDesktop = async ({
  directory = desktopDataDirectory(),
  env = process.env,
  platform = process.platform,
  probe,
  timeoutMs = 30_000,
  intervalMs = 300,
  launch = launchDesktop,
  sleepImplementation = sleep,
  now = () => Date.now(),
  stderr = process.stderr,
} = {}) => {
  const attempt = async () => {
    const connection = await readLocalConnection(directory);
    const probed = probe ? await probe(connection) : undefined;
    return { connection, probed };
  };

  try {
    return await attempt();
  } catch (error) {
    if (autostartDisabled(env) || !isRecoverableStartError(error)) {
      throw error;
    }
  }

  if (!(await launch(platform))) {
    throw new Error(
      "LightFlux Desktop is not installed or could not be started. Open the app once from Applications, then retry.",
    );
  }
  stderr?.write("Starting LightFlux Desktop, waiting for it to be ready…\n");
  const deadline = now() + timeoutMs;
  let latestError;
  do {
    await sleepImplementation(intervalMs);
    try {
      return await attempt();
    } catch (error) {
      if (!isRecoverableStartError(error)) throw error;
      latestError = error;
    }
  } while (now() < deadline);
  throw new Error(
    "LightFlux Desktop did not become ready in time. Open the app once and retry.",
    { cause: latestError },
  );
};
