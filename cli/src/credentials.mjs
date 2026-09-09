import {
  chmod,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { defaultConfigDirectory } from './config.mjs';

export const credentialsPath = (
  configDirectory = defaultConfigDirectory(),
) => join(configDirectory, 'credentials.json');

export const readCredentials = async (configDirectory) => {
  try {
    const value = JSON.parse(
      await readFile(credentialsPath(configDirectory), 'utf8'),
    );
    return value.schemaVersion === 1 && typeof value.token === 'string'
      ? { schemaVersion: 1, token: value.token }
      : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

export const writeCredentials = async (token, configDirectory) => {
  const directory = configDirectory ?? defaultConfigDirectory();
  const destination = credentialsPath(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    destination,
    `${JSON.stringify({ schemaVersion: 1, token }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(destination, 0o600);
  return destination;
};

export const deleteCredentials = async (configDirectory) => {
  await rm(credentialsPath(configDirectory), { force: true });
};
