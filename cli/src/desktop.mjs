import { spawnSync } from 'node:child_process';

const DESKTOP_BUNDLE_ID = 'com.little1d.lightflux';
// Windows/Linux packages register the lightflux:// scheme; the desktop ignores
// unknown links (only cli/authorize is handled), so the URL only wakes the app.
const DESKTOP_WAKE_URL = 'lightflux://wake';

const authorizationUrl = (value) => {
  const url = new URL(value);
  const code = url.searchParams.get('code')?.toUpperCase();
  if (
    url.protocol !== 'lightflux:' ||
    url.hostname !== 'cli' ||
    url.pathname !== '/authorize' ||
    !code ||
    !/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)
  ) {
    throw new Error('Invalid LightFlux desktop authorization URL.');
  }
  return `lightflux://cli/authorize?code=${code}`;
};

export const desktopAuthorizationCommand = (
  value,
  platform = process.platform,
) => {
  const url = authorizationUrl(value);
  if (platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/d', '/s', '/c', 'start', '""', url],
    };
  }
  return { command: 'xdg-open', args: [url] };
};

export const openDesktopAuthorization = (value) => {
  const { args, command } = desktopAuthorizationCommand(value);
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
};

export const desktopLaunchCommand = (platform = process.platform) => {
  if (platform === 'darwin') {
    return { command: 'open', args: ['-b', DESKTOP_BUNDLE_ID] };
  }
  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/d', '/s', '/c', 'start', '""', DESKTOP_WAKE_URL],
    };
  }
  return { command: 'xdg-open', args: [DESKTOP_WAKE_URL] };
};

export const launchDesktop = (platform = process.platform) => {
  const { args, command } = desktopLaunchCommand(platform);
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
};
