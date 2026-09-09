import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';

import { emailAuthBaseUrl } from './authConfig';
import {
  isDesktopRuntime,
  loadDesktopAuthToken,
} from './desktopRuntime';

export const authClient = createAuthClient({
  baseURL: emailAuthBaseUrl,
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [emailOTPClient()],
});

export const getAuthRequestHeaders = async (): Promise<
  Record<string, string>
> => {
  if (!isDesktopRuntime()) {
    return {};
  }
  const token = await loadDesktopAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
