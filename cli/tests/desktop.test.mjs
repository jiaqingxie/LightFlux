import assert from 'node:assert/strict';
import test from 'node:test';

import { desktopAuthorizationCommand } from '../src/desktop.mjs';

const url = 'lightflux://cli/authorize?code=ABCD-2345';

test('builds platform-native desktop authorization commands', () => {
  assert.deepEqual(desktopAuthorizationCommand(url, 'darwin'), {
    args: [url],
    command: 'open',
  });
  assert.deepEqual(desktopAuthorizationCommand(url, 'linux'), {
    args: [url],
    command: 'xdg-open',
  });
  assert.deepEqual(desktopAuthorizationCommand(url, 'win32'), {
    args: ['/d', '/s', '/c', 'start', '""', url],
    command: 'cmd',
  });
});

test('rejects non-LightFlux authorization URLs', () => {
  assert.throws(
    () => desktopAuthorizationCommand('https://lightflux.site/settings'),
    /Invalid LightFlux desktop authorization URL/,
  );
});
