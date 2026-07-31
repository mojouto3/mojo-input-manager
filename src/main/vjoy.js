const { execFile } = require('child_process');
const fs = require('fs');

const VJOY_CONFIG_PATH = 'C:\\Program Files\\vJoy\\x64\\vJoyConfig.exe';
const ERROR_CANCELLED = 1223;

function findVJoyConfig() {
  return fs.existsSync(VJOY_CONFIG_PATH) ? VJOY_CONFIG_PATH : null;
}

function parseStatus(output) {
  const devices = [];
  const deviceRegex = /Device (\d+):\s*Status:\s*(\S+)/g;
  let match;
  while ((match = deviceRegex.exec(output))) {
    devices.push({ index: Number(match[1]), status: match[2] });
  }
  return devices;
}

function getStatus() {
  return new Promise((resolve, reject) => {
    const exe = findVJoyConfig();
    if (!exe) {
      reject(new Error('vJoy was not found on this system.'));
      return;
    }
    execFile(exe, ['-t', '-c'], (err, stdout) => {
      if (err) {
        reject(new Error('Could not read vJoy configuration.'));
        return;
      }
      resolve(parseStatus(stdout));
    });
  });
}

function runElevated(exePath, args) {
  return new Promise((resolve, reject) => {
    const psArgs = args.map((arg) => `'${String(arg).replace(/'/g, "''")}'`).join(',');
    const script = [
      'try {',
      `  $p = Start-Process -FilePath '${exePath}' -ArgumentList ${psArgs} -Verb RunAs -Wait -PassThru`,
      '  exit $p.ExitCode',
      '} catch {',
      `  exit ${ERROR_CANCELLED}`,
      '}'
    ].join(' ');

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (err) => {
      if (err) {
        const cancelled = err.code === ERROR_CANCELLED;
        reject(Object.assign(new Error(cancelled ? 'Cancelled by user.' : 'vJoyConfig reported an error.'), { cancelled }));
        return;
      }
      resolve();
    });
  });
}

function createDevice(index) {
  const exe = findVJoyConfig();
  if (!exe) return Promise.reject(new Error('vJoy was not found on this system.'));
  return runElevated(exe, [String(index), '-f']);
}

function deleteDevice(index) {
  const exe = findVJoyConfig();
  if (!exe) return Promise.reject(new Error('vJoy was not found on this system.'));
  return runElevated(exe, ['-d', String(index)]);
}

module.exports = { findVJoyConfig, getStatus, createDevice, deleteDevice };
