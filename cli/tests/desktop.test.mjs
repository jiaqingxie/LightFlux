import assert from 'node:assert/strict';
import test from 'node:test';

import {
  desktopAuthorizationCommand,
  desktopLaunchCommand,
} from '../src/desktop.mjs';

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

test('builds platform-native commands to launch the desktop app', () => {
  assert.deepEqual(desktopLaunchCommand('darwin'), {
    args: ['-b', 'com.little1d.lightflux'],
    command: 'open',
  });
  assert.deepEqual(desktopLaunchCommand('win32'), {
    args: ['/d', '/s', '/c', 'start', '""', 'lightflux://wake'],
    command: 'cmd',
  });
  assert.deepEqual(desktopLaunchCommand('linux'), {
    args: ['lightflux://wake'],
    command: 'xdg-open',
  });
});
