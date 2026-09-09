import { spawnSync } from 'node:child_process';

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
