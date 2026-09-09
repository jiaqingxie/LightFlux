import { getVersion } from '@tauri-apps/api/app';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  getCurrent as getCurrentDeepLinks,
  onOpenUrl,
} from '@tauri-apps/plugin-deep-link';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  check,
  DownloadEvent,
  Update,
} from '@tauri-apps/plugin-updater';

export type DockBadgeMode = 'none' | 'overdue' | 'today';
export type DockIconStyle = 'flux' | 'graphite' | 'paper';
export type DockVisibility = 'always' | 'hidden' | 'window-open';
export type DesktopCloseBehavior = 'hide' | 'quit';
export type UpdateReminderMode =
  | 'settings-only'
  | 'sidebar'
  | 'sidebar-and-toast';

export interface DesktopPreferences {
  autoDownloadUpdates: boolean;
  closeBehavior: DesktopCloseBehavior;
  dockBadge: DockBadgeMode;
  dockIcon: DockIconStyle;
  dockVisibility: DockVisibility;
  skippedUpdateVersions: string[];
  updateReminder: UpdateReminderMode;
}

export interface DesktopEnvironment {
  currentVersion: string;
  isDesktop: boolean;
  isMacos: boolean;
  updaterConfigured: boolean;
}

export interface DesktopStatusPayload {
  badgeCount: number | null;
  language: 'en' | 'zh';
  overdueCount: number;
  todayCount: number;
  updateReady: boolean;
  updateVersion: string | null;
}

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  autoDownloadUpdates: false,
  closeBehavior: 'hide',
  dockBadge: 'today',
  dockIcon: 'flux',
  dockVisibility: 'always',
  skippedUpdateVersions: [],
  updateReminder: 'sidebar-and-toast',
};

const FALLBACK_ENVIRONMENT: DesktopEnvironment = {
  currentVersion: '1.0.0',
  isDesktop: false,
  isMacos: false,
  updaterConfigured: false,
};

export const isDesktopRuntime = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

export const loadDesktopAuthToken = async (): Promise<string | null> => {
  if (!isDesktopRuntime()) {
    return null;
  }
  return invoke<string | null>('load_desktop_auth_token');
};

export const storeDesktopAuthToken = async (
  token: string | null,
): Promise<void> => {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke('store_desktop_auth_token', { token });
};

export const parseCliAuthorizationDeepLink = (
  value: string,
): string | null => {
  try {
    const url = new URL(value);
    const code = url.searchParams.get('code')?.toUpperCase();
    return url.protocol === 'lightflux:' &&
      url.hostname === 'cli' &&
      url.pathname === '/authorize' &&
      code &&
      /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)
      ? code
      : null;
  } catch {
    return null;
  }
};

export const listenForDesktopDeepLinks = async (
  listener: (url: string) => void,
): Promise<UnlistenFn> => {
  if (!isDesktopRuntime()) {
    return () => undefined;
  }
  const seen = new Set<string>();
  const emit = (urls: string[] | null) => {
    for (const url of urls ?? []) {
      if (!seen.has(url)) {
        seen.add(url);
        listener(url);
      }
    }
  };
  const unlisten = await onOpenUrl(emit);
  emit(await getCurrentDeepLinks().catch(() => null));
  return unlisten;
};

export const getDesktopEnvironment =
  async (): Promise<DesktopEnvironment> => {
    if (!isDesktopRuntime()) {
      return {
        ...FALLBACK_ENVIRONMENT,
        currentVersion: await getVersion().catch(
          () => FALLBACK_ENVIRONMENT.currentVersion,
        ),
      };
    }
    return invoke<DesktopEnvironment>('desktop_environment');
  };

export const applyDesktopPreferences = async (
  preferences: DesktopPreferences,
): Promise<void> => {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke('apply_desktop_preferences', {
    preferences: {
      closeBehavior: preferences.closeBehavior,
      dockBadge: preferences.dockBadge,
      dockIcon: preferences.dockIcon,
      dockVisibility: preferences.dockVisibility,
    },
  });
};

export const syncDesktopStatus = async (
  status: DesktopStatusPayload,
): Promise<void> => {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke('update_desktop_status', { status });
};

export const checkDesktopUpdate = async (): Promise<Update | null> =>
  check({ timeout: 15_000 });

export const downloadDesktopUpdate = async (
  update: Update,
  onEvent: (event: DownloadEvent) => void,
): Promise<void> => update.downloadAndInstall(onEvent, { timeout: 120_000 });

export const relaunchDesktop = async (): Promise<void> => relaunch();

export const exportDesktopBackup = async (
  content: string,
): Promise<string> => {
  if (!isDesktopRuntime()) {
    throw new Error('Desktop backup export requires the desktop application.');
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return invoke<string>('export_app_state_backup', {
    content,
    filename: `lightflux-backup-${timestamp}.json`,
  });
};

export const importDesktopBackup = async (): Promise<string | null> => {
  if (!isDesktopRuntime()) {
    throw new Error('Desktop backup import requires the desktop application.');
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.accept = 'application/json,.json';
    input.type = 'file';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        reject(new Error('The selected backup is larger than 50 MB.'));
        return;
      }
      file.text().then(resolve, reject);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
};

export const listenForTrayActions = async (
  listener: (action: string) => void,
): Promise<UnlistenFn> => {
  if (!isDesktopRuntime()) {
    return () => undefined;
  }
  return listen<string>('lightflux://tray-action', (event) => {
    listener(event.payload);
  });
};

export const quitDesktop = async (): Promise<void> => {
  if (isDesktopRuntime()) {
    await invoke('quit_desktop');
  }
};
