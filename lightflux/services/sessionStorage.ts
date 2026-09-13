// Legacy session markers and tokens are left untouched for data recovery.
// The desktop no longer restores or revokes a hosted account.
export type SessionState = 'authenticated' | 'local' | 'signed-out';

export const loadSessionState = async (): Promise<SessionState> => 'local';

export const saveSessionState = async (_state: SessionState): Promise<void> => {};
