const { spawn } = require('child_process');
const fs = require('fs');

const CLI_PATH = 'C:\\Program Files\\Nefarius Software Solutions\\HidHide\\x64\\HidHideCLI.exe';
const TIMEOUT_MS = 5000;

function findCli() {
  return fs.existsSync(CLI_PATH) ? CLI_PATH : null;
}

function runOnce(args) {
  return new Promise((resolve, reject) => {
    const exe = findCli();
    if (!exe) {
      reject(new Error('HidHide was not found on this system.'));
      return;
    }
    // HidHideCLI blocks waiting on stdin for further "sequenced" commands.
    // execFile always gives the child an open stdin pipe (with no way to
    // close it for the async variant), so it hangs forever - spawn lets us
    // set stdin to 'ignore' so the child sees it as closed immediately.
    const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`HidHideCLI could not be started: ${err.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal) {
        reject(new Error('HidHideCLI timed out.'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`HidHideCLI reported an error: ${stderr || `exit code ${code}`}`));
        return;
      }
      resolve(stdout);
    });
  });
}

// HidHideCLI's driver handle doesn't tolerate concurrent invocations (one
// call can fail with "Access is denied" while another is in flight), so
// every call is funneled through this queue to force them to run one at a time.
let queue = Promise.resolve();

function run(args) {
  const result = queue.then(() => runOnce(args));
  queue = result.catch(() => {});
  return result;
}

function parseQuotedPaths(output, flag) {
  const paths = [];
  const regex = new RegExp(`${flag}\\s+"([^"]+)"`, 'g');
  let match;
  while ((match = regex.exec(output))) {
    paths.push(match[1]);
  }
  return paths;
}

async function getDevices() {
  const gamingOutput = await run(['--dev-gaming']);
  const hiddenOutput = await run(['--dev-list']);
  const gaming = JSON.parse(gamingOutput);
  const hiddenPaths = new Set(parseQuotedPaths(hiddenOutput, '--dev-hide'));

  const devices = [];
  for (const entry of gaming) {
    for (const device of entry.devices) {
      devices.push({
        path: device.deviceInstancePath,
        name: (device.product || entry.friendlyName).trim(),
        present: device.present,
        hidden: hiddenPaths.has(device.deviceInstancePath)
      });
    }
  }
  return devices;
}

async function getCloakState() {
  const output = await run(['--cloak-state']);
  return output.trim() === '--cloak-on';
}

function hideDevice(devicePath) {
  return run(['--dev-hide', devicePath]);
}

function unhideDevice(devicePath) {
  return run(['--dev-unhide', devicePath]);
}

function setCloak(enabled) {
  return run([enabled ? '--cloak-on' : '--cloak-off']);
}

async function getApps() {
  const output = await run(['--app-list']);
  return parseQuotedPaths(output, '--app-reg');
}

function registerApp(exePath) {
  return run(['--app-reg', exePath]);
}

function unregisterApp(exePath) {
  return run(['--app-unreg', exePath]);
}

module.exports = {
  getDevices,
  getCloakState,
  hideDevice,
  unhideDevice,
  setCloak,
  getApps,
  registerApp,
  unregisterApp
};
