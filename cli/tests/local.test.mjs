import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  autostartDisabled,
  connectLocalDesktop,
  desktopDataDirectory,
  readLocalConnection,
} from "../src/local.mjs";

const validDescriptor = {
  schemaVersion: 1,
  apiUrl: "http://127.0.0.1:19999",
  token: "x".repeat(72),
};

test("discovers desktop data on supported operating systems", () => {
  assert.equal(
    desktopDataDirectory("darwin", {}, "/home/me"),
    "/home/me/Library/Application Support/com.little1d.lightflux",
  );
  assert.equal(
    desktopDataDirectory("linux", {}, "/home/me"),
    "/home/me/.local/share/com.little1d.lightflux",
  );
  assert.equal(
    desktopDataDirectory("linux", { XDG_DATA_HOME: "/data" }),
    "/data/com.little1d.lightflux",
  );
});

test("reads owner-only loopback descriptor and rejects remote destinations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lightflux-local-"));
  const path = join(directory, "local-api.json");
  try {
    await assert.rejects(
      readLocalConnection(directory),
      /Open LightFlux Desktop/,
    );
    const descriptor = {
      schemaVersion: 1,
      apiUrl: "http://127.0.0.1:19999",
      token: "x".repeat(72),
    };
    await writeFile(path, JSON.stringify(descriptor), { mode: 0o600 });
    assert.deepEqual(await readLocalConnection(directory), {
      apiUrl: descriptor.apiUrl,
      token: descriptor.token,
    });
    for (const apiUrl of [
      "https://lightflux.site",
      "http://localhost:19999",
      "http://127.0.0.1:19999/evil",
      "http://user@127.0.0.1:19999",
    ]) {
      await writeFile(path, JSON.stringify({ ...descriptor, apiUrl }));
      await assert.rejects(readLocalConnection(directory), /Invalid local/);
    }
    if (process.platform !== "win32") {
      await chmod(path, 0o644);
      await assert.rejects(readLocalConnection(directory), /0600/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("autostart honours explicit opt-out and CI environments", () => {
  assert.equal(autostartDisabled({}), false);
  assert.equal(autostartDisabled({ LIGHTFLUX_NO_AUTOSTART: "1" }), true);
  assert.equal(autostartDisabled({ LIGHTFLUX_NO_AUTOSTART: "true" }), true);
  assert.equal(autostartDisabled({ CI: "true" }), true);
  assert.equal(autostartDisabled({ CI: "false" }), false);
});

test("connects directly when the desktop is already running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lightflux-local-"));
  const launches = [];
  try {
    await writeFile(join(directory, "local-api.json"), JSON.stringify(validDescriptor), {
      mode: 0o600,
    });
    const result = await connectLocalDesktop({
      directory,
      env: {},
      platform: "darwin",
      launch: async (platform) => {
        launches.push(platform);
        return true;
      },
    });
    assert.deepEqual(result.connection, {
      apiUrl: "http://127.0.0.1:19999",
      token: validDescriptor.token,
    });
    assert.equal(launches.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("never launches a GUI when autostart is disabled", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lightflux-local-"));
  try {
    await assert.rejects(
      connectLocalDesktop({
        directory,
        env: { CI: "true" },
        launch: async () => assert.fail("launch must not be called"),
      }),
      /Open LightFlux Desktop first/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("launches the desktop and waits for the loopback descriptor", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lightflux-local-"));
  const messages = [];
  try {
    const result = await connectLocalDesktop({
      directory,
      env: {},
      platform: "darwin",
      intervalMs: 5,
      timeoutMs: 2000,
      stderr: { write: (value) => messages.push(value) },
      launch: async (platform) => {
        assert.equal(platform, "darwin");
        await writeFile(
          join(directory, "local-api.json"),
          JSON.stringify(validDescriptor),
          { mode: 0o600 },
        );
        return true;
      },
    });
    assert.equal(result.connection.apiUrl, "http://127.0.0.1:19999");
    assert.match(messages.join(""), /Starting LightFlux Desktop/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports when the desktop app cannot be launched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lightflux-local-"));
  try {
    await assert.rejects(
      connectLocalDesktop({
        directory,
        env: {},
        launch: async () => false,
      }),
      /not installed or could not be started/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("times out when the launched desktop never exposes the API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lightflux-local-"));
  let ticks = 0;
  try {
    await assert.rejects(
      connectLocalDesktop({
        directory,
        env: {},
        intervalMs: 2,
        timeoutMs: 20,
        launch: async () => true,
        sleepImplementation: async () => {
          ticks += 1;
        },
        now: () => ticks * 3,
        stderr: null,
      }),
      /did not become ready in time/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("relaunches and retries once when the loopback probe is unreachable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lightflux-local-"));
  try {
    await writeFile(join(directory, "local-api.json"), JSON.stringify(validDescriptor), {
      mode: 0o600,
    });
    let probes = 0;
    const result = await connectLocalDesktop({
      directory,
      env: {},
      intervalMs: 1,
      timeoutMs: 2000,
      stderr: null,
      launch: async () => true,
      probe: async (connection) => {
        probes += 1;
        if (probes === 1) {
          throw Object.assign(new Error("dead socket"), { status: 503 });
        }
        return { ok: true, apiUrl: connection.apiUrl };
      },
    });
    assert.equal(probes, 2);
    assert.deepEqual(result.probed, {
      ok: true,
      apiUrl: "http://127.0.0.1:19999",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
