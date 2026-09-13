import SettingsScreen from '../components/SettingsScreen';
import { useAppShell } from '../components/appShellContext';

export default function SettingsRoute() {
  const shell = useAppShell();
  return (
    <SettingsScreen
      hiddenNavigationItems={shell.hiddenNavigationItems}
      onNavigationVisibilityChange={shell.setNavigationVisible}
      onOpenStatistics={() => shell.changeView('statistics')}
    />
  );
}
