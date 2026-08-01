import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, ShieldCheck, Plus, Play, Trash2 } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Tabs from '../components/Tabs';
import Toggle from '../components/Toggle';

const hidhide = typeof window !== 'undefined' ? window.mim?.hidhide : undefined;
const profilesApi = typeof window !== 'undefined' ? window.mim?.profiles : undefined;

export default function DeviceFiltering() {
  const [activeTab, setActiveTab] = useState('devices');
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
              ? 'Hidden devices are invisible to every app except those on the allow list.'
              : 'Hiding a device has no effect on other apps yet while cloaking is off.'}
          </p>
        </div>
        <Toggle checked={cloakEnabled} onChange={handleToggleCloak} disabled={cloakBusy} glow />
      </Card>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
          >
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'devices', label: 'Devices', count: devices.length },
          { id: 'apps', label: 'Allowed Applications', count: apps.length },
          { id: 'profiles', label: 'Profiles', count: profiles.length }
        ]}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {activeTab === 'devices' &&
            (devices.length === 0 ? (
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
                        <Toggle checked={!device.hidden} disabled={isBusy} onChange={() => handleToggle(device)} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            ))}

          {activeTab === 'apps' && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-mim-muted">These apps can still see hidden devices while cloaking is on.</p>
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
                        aria-label={`Remove ${exePath.split('\\').pop()}`}
                        className="glass-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-red-400 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:shadow-[0_0_14px_rgba(239,68,68,0.35)] disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'profiles' && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-mim-muted">
                  Applying a profile hides the right devices, allows the game, and turns cloaking on.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => (showProfileForm ? resetProfileForm() : setShowProfileForm(true))}
                  className="flex items-center gap-2"
                >
                  <Plus size={14} />
                  New Profile
                </Button>
              </div>

              <AnimatePresence>
                {showProfileForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <Card hover={false} className="mb-4 flex flex-col gap-4 p-4">
                      <div>
                        <label className="mb-1 block text-xs text-mim-muted">Name</label>
                        <input
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder="e.g. Racing Sim"
                          className="glass-surface w-full rounded-md px-3 py-2 text-sm text-white outline-none focus:border-mim-accent"
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
                                className="accent-mim-accent"
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
                  </motion.div>
                )}
              </AnimatePresence>

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
                        <div className="flex shrink-0 items-center gap-3">
                          <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleApplyProfile(profile)}
                            disabled={isBusy}
                            className="flex h-9 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#3ddb3d,#28a428)] px-4 text-xs font-semibold text-mim-bg shadow-[0_4px_16px_-4px_rgba(61,219,61,0.5)] transition-shadow disabled:opacity-50"
                          >
                            <Play size={13} />
                            {isBusy ? 'Working...' : 'Apply'}
                          </motion.button>
                          <button
                            onClick={() => handleDeleteProfile(profile)}
                            disabled={isBusy}
                            aria-label={`Delete ${profile.name}`}
                            className="glass-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-red-400 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:shadow-[0_0_14px_rgba(239,68,68,0.35)] disabled:opacity-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
