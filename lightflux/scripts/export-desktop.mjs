import { spawnSync } from 'node:child_process';

const env = { ...process.env, EXPO_NO_DOTENV: '1' };
for (const key of ['EXPO_PUBLIC_AUTH_API_URL', 'EXPO_PUBLIC_UPLOAD_API_URL', 'EXPO_PUBLIC_AI_API_URL']) {
  env[key] = '';
}
const result = spawnSync(process.execPath, [
  './node_modules/expo/bin/cli', 'export', '--platform', 'web',
  '--output-dir', 'desktop-dist', '--clear',
], { env, stdio: 'inherit' });
process.exit(result.status ?? 1);
