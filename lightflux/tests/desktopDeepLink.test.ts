import { describe, expect, it } from 'vitest';

import { parseCliAuthorizationDeepLink } from '../services/desktopRuntime';

describe('parseCliAuthorizationDeepLink', () => {
  it('reads a valid CLI authorization code', () => {
    expect(
      parseCliAuthorizationDeepLink(
        'lightflux://cli/authorize?code=abcd-2345',
      ),
    ).toBe('ABCD-2345');
  });

  it('rejects unrelated or malformed links', () => {
    expect(
      parseCliAuthorizationDeepLink(
        'lightflux://cli/authorize?code=ABCD-1234',
      ),
    ).toBeNull();
    expect(
      parseCliAuthorizationDeepLink(
        'https://lightflux.site/settings?code=ABCD-2345',
      ),
    ).toBeNull();
  });
});
