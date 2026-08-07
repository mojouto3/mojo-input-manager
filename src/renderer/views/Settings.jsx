import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Palette, Info, RefreshCw, Download, Upload, Power } from 'lucide-react';
import Card from '../components/Card';
import Toggle from '../components/Toggle';
import ConfirmDialog from '../components/ConfirmDialog';
import { getTheme, setTheme } from '../theme';

const mim = typeof window !== 'undefined' ? window.mim : undefined;

const THEMES = [
  { id: 'green', label: 'Neon Green', swatch: '#3ddb3d' },
  { id: 'cyan', label: 'Electric Cyan', swatch: '#3ddce8' }
];

const STATUS_LABEL = {
  idle: 'Not checked yet',
  checking: 'Checking for updates...',
  available: 'Update available, downloading...',
  'not-available': 'Up to date',
  downloading: 'Downloading update...',
  downloaded: 'Update ready, restart to install',
  error: 'Update check failed',
  unsupported: 'Only available in installed builds'
};

export default function Settings() {
  const [theme, setThemeState] = useState(getTheme());
  const [version, setVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle' });
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [launchAtStartup, setLaunchAtStartupState] = useState(false);

  useEffect(() => {
    mim?.system?.getAppVersion().then(setVersion);
    mim?.system?.getUpdateStatus().then(setUpdateStatus);
    mim?.system?.getLaunchAtStartup().then(setLaunchAtStartupState);
    return mim?.system?.onUpdateStatus(setUpdateStatus);
  }, []);

  async function toggleLaunchAtStartup(enabled) {
    setLaunchAtStartupState(enabled);
    await mim?.system?.setLaunchAtStartup(enabled);
  }

  function chooseTheme(id) {
    setTheme(id);
    setThemeState(id);
  }

  async function handleExport() {
    setBackupBusy(true);
    setBackupNotice(null);
    const result = await mim?.backup?.export();
    if (result?.ok) {
      setBackupNotice({ type: 'success', text: `Exported to ${result.path}` });
    } else if (!result?.cancelled) {
      setBackupNotice({ type: 'error', text: result?.error ?? 'Export failed.' });
    }
    setBackupBusy(false);
  }

  async function handleImport() {
    setBackupBusy(true);
    setBackupNotice(null);
    const result = await mim?.backup?.pickImportFile();
    if (result?.ok) {
      // Hold onto the parsed file and ask in-app instead of a native message
      // box, applying it only happens once the user confirms below.
      setPendingImport(result.data);
    } else if (!result?.cancelled) {
      setBackupNotice({ type: 'error', text: result?.error ?? 'Import failed.' });
    }
    setBackupBusy(false);
  }

  async function confirmImport() {
    const data = pendingImport;
    setPendingImport(null);
    setBackupBusy(true);
    const result = await mim?.backup?.applyImport(data);
    if (result?.ok) {
      setBackupNotice({ type: 'success', text: 'Profiles imported. Restart MIM to see them everywhere.' });
    } else {
      setBackupNotice({ type: 'error', text: result?.error ?? 'Import failed.' });
    }
    setBackupBusy(false);
  }

  const statusLabel = STATUS_LABEL[updateStatus.status] ?? updateStatus.status;
  const isBusy = updateStatus.status === 'checking' || updateStatus.status === 'downloading';
  const checkDisabled = isBusy || updateStatus.status === 'unsupported';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-mim-muted">Appearance and app info.</p>
      </div>

      <Card hover={false} className="mb-4 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Palette size={16} className="text-mim-muted" />
          <h2 className="text-sm font-semibold text-white">Appearance</h2>
        </div>
        <div className="flex gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => chooseTheme(t.id)}
              className={`flex flex-1 items-center gap-3 rounded-lg px-4 py-3 text-left text-sm transition-all ${
                theme === t.id
                  ? 'border border-mim-accent/30 bg-mim-accent/10 text-white shadow-[0_0_10px_rgba(var(--color-mim-accent-rgb),0.15)]'
                  : 'glass-surface text-mim-muted hover:text-white'
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: t.swatch, boxShadow: `0 0 8px ${t.swatch}` }}
              />
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card hover={false} className="mb-4 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Power size={16} className="text-mim-muted" />
          <h2 className="text-sm font-semibold text-white">Background</h2>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white">Launch at startup</p>
            <p className="mt-1 text-xs text-mim-muted">
              Start MIM minimized to the tray when you log into Windows.
            </p>
          </div>
          <Toggle checked={launchAtStartup} onChange={toggleLaunchAtStartup} />
        </div>
      </Card>

      <Card hover={false} className="mb-4 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Download size={16} className="text-mim-muted" />
          <h2 className="text-sm font-semibold text-white">Backup</h2>
        </div>
        <p className="mb-4 text-sm text-mim-muted">
          Export your Device Filtering profiles and remembered mappings to a file, useful before reinstalling
          Windows or moving to a new setup on the same hardware.
        </p>
        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleExport}
            disabled={backupBusy}
            className="glass-surface flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white transition-shadow disabled:opacity-50"
          >
            <Download size={13} />
            Export Profiles
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleImport}
            disabled={backupBusy}
            className="glass-surface flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white transition-shadow disabled:opacity-50"
          >
            <Upload size={13} />
            Import Profiles
          </motion.button>
        </div>
        {backupNotice && (
          <p className={`mt-3 text-xs ${backupNotice.type === 'error' ? 'text-red-400' : 'text-mim-muted'}`}>
            {backupNotice.text}
          </p>
        )}
      </Card>

      <Card hover={false} className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Info size={16} className="text-mim-muted" />
          <h2 className="text-sm font-semibold text-white">About</h2>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white">Mojo Input Manager{version && ` v${version}`}</p>
            <p className="mt-1 text-xs text-mim-muted">
              {statusLabel}
              {updateStatus.status === 'downloading' && typeof updateStatus.percent === 'number'
                ? ` (${updateStatus.percent}%)`
                : ''}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => mim?.system?.checkForUpdates()}
            disabled={checkDisabled}
            className="glass-surface flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white transition-shadow disabled:opacity-50"
          >
            <RefreshCw size={13} className={updateStatus.status === 'checking' ? 'animate-spin' : ''} />
            Check for Updates
          </motion.button>
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(pendingImport)}
        title="Import MIM Profiles"
        message={
          pendingImport &&
          `Import ${pendingImport.deviceFilteringProfiles.length} device filtering profile(s), ${pendingImport.mappingProfiles.length} mapping(s), and ${(pendingImport.gameProfiles ?? []).length} game profile(s)?`
        }
        detail="This replaces your current saved profiles and mappings. This cannot be undone."
        confirmLabel="Import"
        onConfirm={confirmImport}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}
