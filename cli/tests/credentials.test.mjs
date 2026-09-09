import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  deleteCredentials,
  readCredentials,
  writeCredentials,
} from '../src/credentials.mjs';

test('stores credentials separately with owner-only permissions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lightflux-credentials-'));
  const path = await writeCredentials('secret-token', directory);

  assert.deepEqual(await readCredentials(directory), {
    schemaVersion: 1,
    token: 'secret-token',
  });
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.match(await readFile(path, 'utf8'), /secret-token/);

  await deleteCredentials(directory);
  assert.equal(await readCredentials(directory), null);
});
