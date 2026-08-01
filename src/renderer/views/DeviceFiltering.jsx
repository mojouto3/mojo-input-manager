import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ShieldCheck, EyeOff, Eye, Plus, X, Play, Trash2 } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';

const hidhide = typeof window !== 'undefined' ? window.mim?.hidhide : undefined;
const profilesApi = typeof window !== 'undefined' ? window.mim?.profiles : undefined;

export default function DeviceFiltering() {
  const [devices, setDevices] = useState([]);
  const [apps, setApps] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [cloakEnabled, setCloakEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyPath, setBusyPath] = useState(null);
  const [cloakBusy, setCloakBusy] = useState(false);
  const [appBusy, setAppBusy] = useState(false);
  const [profileBusyId, setProfileBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAppPath, setProfileAppPath] = useState('');
  const [profileHiddenPaths, setProfileHiddenPaths] = useState(new Set());

  const refresh = useCallback(async () => {
    if (!hidhide) {
      setLoadError('This feature is only available inside the desktop app.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const [devicesResult, appsResult, profilesResult] = await Promise.all([
      hidhide.getDevices(),
      hidhide.getApps(),
      profilesApi.list()
    ]);
    if (devicesResult.ok) {
      setDevices(devicesResult.devices);
      setCloakEnabled(devicesResult.cloakEnabled);
      setLoadError(null);
    } else {
      setLoadError(devicesResult.error);
    }
    if (appsResult.ok) {
      setApps(appsResult.apps);
    }
    if (profilesResult.ok) {
      setProfiles(profilesResult.profiles);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleToggleCloak() {
    setCloakBusy(true);
    setNotice(null);
    const result = await hidhide.setCloak(!cloakEnabled);
    if (!result.ok) {
      setNotice({ text: `Cloaking: ${result.error}` });
    }
    setCloakBusy(false);
    refresh();
  }

  async function handleToggle(device) {
    setBusyPath(device.path);
    setNotice(null);
    const result = device.hidden ? await hidhide.unhideDevice(device.path) : await hidhide.hideDevice(device.path);
    if (!result.ok) {
      setNotice({ text: `${device.name}: ${result.error}` });
    }
    setBusyPath(null);
    refresh();
  }

  async function handleAddApp() {
    const picked = await hidhide.pickApp();
    if (!picked.ok) return;
    setAppBusy(true);
    setNotice(null);
    const result = await hidhide.registerApp(picked.path);
    if (!result.ok) {
      setNotice({ text: `${picked.path}: ${result.error}` });
    }
    setAppBusy(false);
    refresh();
  }

  async function handleRemoveApp(exePath) {
    setAppBusy(true);
    setNotice(null);
    const result = await hidhide.unregisterApp(exePath);
    if (!result.ok) {
      setNotice({ text: `${exePath}: ${result.error}` });
    }
    setAppBusy(false);
    refresh();
  }

  function resetProfileForm() {
    setShowProfileForm(false);
    setProfileName('');
    setProfileAppPath('');
    setProfileHiddenPaths(new Set());
  }

  async function handlePickProfileApp() {
    const picked = await hidhide.pickApp();
    if (picked.ok) setProfileAppPath(picked.path);
  }

  function toggleProfileDevice(devicePath) {
    setProfileHiddenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(devicePath)) next.delete(devicePath);
      else next.add(devicePath);
      return next;
    });
  }

  async function handleSaveProfile() {
    if (!profileName.trim() || !profileAppPath) return;
    setNotice(null);
    const result = await profilesApi.create({
      name: profileName.trim(),
      appPath: profileAppPath,
      hiddenDevicePaths: Array.from(profileHiddenPaths)
    });
    if (!result.ok) {
      setNotice({ text: `Profile: ${result.error}` });
      return;
    }
    resetProfileForm();
    refresh();
  }

  async function handleApplyProfile(profile) {
    setProfileBusyId(profile.id);
    setNotice(null);
    const result = await profilesApi.apply(profile.id);
    if (!result.ok) {
      setNotice({ text: `${profile.name}: ${result.error}` });
    }
    setProfileBusyId(null);
    refresh();
  }

  async function handleDeleteProfile(profile) {
    setProfileBusyId(profile.id);
    await profilesApi.remove(profile.id);
    setProfileBusyId(null);
    refresh();
  }

  if (loadError) {
    return (
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
        <Card hover={false} className="px-10 py-8 text-center">
          <h2 className="text-xl font-semibold text-white">Device Filtering</h2>
          <p className="mt-2 text-mim-muted">{loadError}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Device Filtering</h1>
          <p className="mt-1 text-sm text-mim-muted">
            Choose which physical devices are hidden from other applications via HidHide.
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} className="flex items-center gap-2" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <Card hover={false} className="mb-4 flex items-center justify-between gap-4 p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            Cloaking
            <Badge tone={cloakEnabled ? 'green' : 'muted'}>{cloakEnabled ? 'ON' : 'OFF'}</Badge>
          </p>
          <p className="mt-1 text-xs text-mim-muted">
            {cloakEnabled
              ? 'Hidden devices below are invisible to every app except those on the allow list.'
              : 'Hiding a device below has no effect on other apps yet while cloaking is off.'}
          </p>
        </div>
        <Button
          variant={cloakEnabled ? 'secondary' : 'primary'}
          onClick={handleToggleCloak}
          disabled={cloakBusy}
        >
          {cloakBusy ? 'Working...' : cloakEnabled ? 'Turn Off' : 'Turn On'}
        </Button>
      </Card>

      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
        >
          {notice.text}
        </motion.div>
      )}

      {devices.length === 0 ? (
        <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
          <ShieldCheck size={28} className="text-mim-muted" />
          <p className="text-mim-muted">No gaming devices found.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {devices.map((device) => {
            const isBusy = busyPath === device.path;
            return (
              <Card key={device.path} hover={false} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{device.name}</p>
                  <p className="truncate text-xs text-mim-muted">{device.path}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!device.present && <Badge tone="muted">Not connected</Badge>}
                  <Badge tone={device.hidden ? 'cyan' : 'green'} className="w-16">
                    {device.hidden ? 'Hidden' : 'Visible'}
                  </Badge>
                  <button
                    onClick={() => handleToggle(device)}
                    disabled={isBusy}
                    className={`flex w-20 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                      device.hidden
                        ? 'text-mim-green hover:bg-mim-green/10'
                        : 'text-mim-cyan hover:bg-mim-cyan/10'
                    }`}
                  >
                    {device.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
                    {isBusy ? 'Working...' : device.hidden ? 'Unhide' : 'Hide'}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Allowed Applications</h2>
          <p className="text-xs text-mim-muted">These apps can still see hidden devices while cloaking is on.</p>
        </div>
        <Button variant="secondary" onClick={handleAddApp} disabled={appBusy} className="flex items-center gap-2">
          <Plus size={14} />
          Add Application
        </Button>
      </div>

      {apps.length === 0 ? (
        <Card hover={false} className="px-6 py-6 text-center text-sm text-mim-muted">
          No applications on the allow list yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {apps.map((exePath) => (
            <Card key={exePath} hover={false} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{exePath.split('\\').pop()}</p>
                <p className="truncate text-xs text-mim-muted">{exePath}</p>
              </div>
              <button
                onClick={() => handleRemoveApp(exePath)}
                disabled={appBusy}
                className="flex w-20 shrink-0 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <X size={12} />
                Remove
              </button>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Profiles</h2>
          <p className="text-xs text-mim-muted">
            Applying a profile hides the right devices, allows the game, and turns cloaking on.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => (showProfileForm ? resetProfileForm() : setShowProfileForm(true))}
          className="flex items-center gap-2"
        >
          <Plus size={14} />
          New Profile
        </Button>
      </div>

      {showProfileForm && (
        <Card hover={false} className="mb-4 flex flex-col gap-4 p-4">
          <div>
            <label className="mb-1 block text-xs text-mim-muted">Name</label>
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="e.g. Racing Sim"
              className="w-full rounded-md border border-mim-border bg-mim-surface-light px-3 py-2 text-sm text-white outline-none focus:border-mim-green"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-mim-muted">Game application</label>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={handlePickProfileApp}>
                Choose Application
              </Button>
              <span className="truncate text-xs text-mim-muted">
                {profileAppPath || 'No application selected'}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-mim-muted">Devices to hide from other apps</label>
            <div className="flex flex-col gap-1.5">
              {devices.map((device) => (
                <label key={device.path} className="flex items-center gap-2 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={profileHiddenPaths.has(device.path)}
                    onChange={() => toggleProfileDevice(device.path)}
                    className="accent-mim-green"
                  />
                  {device.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={resetProfileForm}>
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} disabled={!profileName.trim() || !profileAppPath}>
              Save Profile
            </Button>
          </div>
        </Card>
      )}

      {profiles.length === 0 ? (
        <Card hover={false} className="px-6 py-6 text-center text-sm text-mim-muted">
          No profiles yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {profiles.map((profile) => {
            const isBusy = profileBusyId === profile.id;
            return (
              <Card key={profile.id} hover={false} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{profile.name}</p>
                  <p className="truncate text-xs text-mim-muted">
                    {profile.appPath.split('\\').pop()} &middot; {profile.hiddenDevicePaths.length} device(s) hidden
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleApplyProfile(profile)}
                    disabled={isBusy}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-mim-green transition-colors hover:bg-mim-green/10 disabled:opacity-50"
                  >
                    <Play size={12} />
                    {isBusy ? 'Working...' : 'Apply'}
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(profile)}
                    disabled={isBusy}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
