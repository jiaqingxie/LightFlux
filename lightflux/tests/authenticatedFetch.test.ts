import { afterEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getAuthRequestHeaders: vi.fn(
    async (): Promise<Record<string, string>> => ({
      Cookie: 'lightflux-auth.session=secure-cookie',
    }),
  ),
  getSession: vi.fn(),
  signInEmailOtp: vi.fn(),
  updateUser: vi.fn(),
}));
const desktopMocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => false),
  loadToken: vi.fn(async () => null as string | null),
  storeToken: vi.fn(async (_token: string | null) => {}),
}));

vi.mock('../services/authClient', () => ({
  authClient: {
    getSession: authMocks.getSession,
    signIn: { emailOtp: authMocks.signInEmailOtp },
    updateUser: authMocks.updateUser,
  },
  getAuthRequestHeaders: authMocks.getAuthRequestHeaders,
}));

vi.mock('../services/authConfig', () => ({
  authApiUrl: 'http://localhost:8787',
  emailAuthBaseUrl: 'http://localhost:8787/api/auth/email',
  isRemoteAuthConfigured: true,
}));

vi.mock('../services/desktopRuntime', () => ({
  isDesktopRuntime: desktopMocks.isDesktopRuntime,
  loadDesktopAuthToken: desktopMocks.loadToken,
  storeDesktopAuthToken: desktopMocks.storeToken,
}));

describe('authenticatedFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    authMocks.getAuthRequestHeaders.mockReset();
    authMocks.getAuthRequestHeaders.mockResolvedValue({
      Cookie: 'lightflux-auth.session=secure-cookie',
    });
    authMocks.getSession.mockReset();
    authMocks.signInEmailOtp.mockReset();
    authMocks.updateUser.mockReset();
    desktopMocks.isDesktopRuntime.mockReturnValue(false);
    desktopMocks.loadToken.mockReset();
    desktopMocks.loadToken.mockResolvedValue(null);
    desktopMocks.storeToken.mockReset();
  });

  it('forwards native secure-session headers to API requests', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { authenticatedFetch } = await import('../services/authApi');

    await authenticatedFetch('http://localhost:8787/api/app-state');

    const request = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get('Cookie')).toBe(
      'lightflux-auth.session=secure-cookie',
    );
    expect(request?.credentials).toBe('include');
  });

  it('requires the native session to be restorable after OTP verification', async () => {
    authMocks.signInEmailOtp.mockResolvedValue({
      data: { user: { id: 'auth-user' } },
      error: null,
    });
    authMocks.getSession.mockResolvedValue({ data: null });
    const { verifyEmailOtp } = await import('../services/authApi');

    await expect(
      verifyEmailOtp('person@example.com', '123456'),
    ).rejects.toThrow('session could not be restored');
  });

  it('persists and uses the bearer session returned to Tauri', async () => {
    desktopMocks.isDesktopRuntime.mockReturnValue(true);
    desktopMocks.loadToken.mockResolvedValue('desktop-session-token');
    authMocks.getAuthRequestHeaders.mockResolvedValue({
      Authorization: 'Bearer desktop-session-token',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          token: 'desktop-session-token',
          user: { email: 'person@example.com', id: 'auth-user' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          authenticated: true,
          user: { email: 'person@example.com', id: 'auth-user' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { verifyEmailOtp } = await import('../services/authApi');

    await expect(
      verifyEmailOtp('person@example.com', '123456'),
    ).resolves.toBeUndefined();

    expect(desktopMocks.storeToken).toHaveBeenCalledWith(
      'desktop-session-token',
    );
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get(
        'Authorization',
      ),
    ).toBe('Bearer desktop-session-token');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://localhost:8787/api/auth/session',
    );
    expect(authMocks.signInEmailOtp).not.toHaveBeenCalled();
  });

  it('clears a rejected Tauri session token', async () => {
    desktopMocks.isDesktopRuntime.mockReturnValue(true);
    authMocks.getAuthRequestHeaders.mockResolvedValue({
      Authorization: 'Bearer rejected-session-token',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          token: 'rejected-session-token',
          user: { email: 'person@example.com', id: 'auth-user' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ authenticated: false }, { status: 401 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { verifyEmailOtp } = await import('../services/authApi');

    await expect(
      verifyEmailOtp('person@example.com', '123456'),
    ).rejects.toThrow('session could not be restored');
    expect(desktopMocks.storeToken.mock.calls).toEqual([
      ['rejected-session-token'],
      [null],
    ]);
  });

  it('builds a bearer header from the persisted Tauri session', async () => {
    desktopMocks.isDesktopRuntime.mockReturnValue(true);
    desktopMocks.loadToken.mockResolvedValue('desktop-session-token');
    const { getAuthRequestHeaders } = await import(
      '../services/authClient.web'
    );

    await expect(getAuthRequestHeaders()).resolves.toEqual({
      Authorization: 'Bearer desktop-session-token',
    });
  });

  it('updates the profile and returns the refreshed session user', async () => {
    authMocks.updateUser.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    authMocks.getSession.mockResolvedValue({
      data: {
        user: {
          email: 'person@example.com',
          id: 'auth-user',
          image: 'https://cdn.example.com/avatar.png',
          name: 'Updated Profile',
        },
      },
    });
    const { updateRemoteProfile } = await import('../services/authApi');

    await expect(
      updateRemoteProfile({
        avatarUrl: 'https://cdn.example.com/avatar.png',
        name: ' Updated Profile ',
      }),
    ).resolves.toEqual({
      avatarUrl: 'https://cdn.example.com/avatar.png',
      email: 'person@example.com',
      id: 'auth-user',
      name: 'Updated Profile',
    });
    expect(authMocks.updateUser).toHaveBeenCalledWith({
      image: 'https://cdn.example.com/avatar.png',
      name: 'Updated Profile',
    });
  });
});
