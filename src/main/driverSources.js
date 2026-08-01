const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const REDIRECT_CODES = [301, 302, 303, 307, 308];
const USER_AGENT = 'mojo-input-manager';

// SourceForge's own download URLs are plain http:// even when the JSON
// metadata comes from https, so requests need to follow whichever scheme
// the current URL (or redirect target) actually uses.
function clientFor(url) {
  return url.startsWith('http://') ? http : https;
}

// vJoy and HidHide are kernel-mode drivers, not something MIM bundles or
// maintains itself. Instead of pointing users to a webpage, MIM asks each
// project's own official source for its latest installer and runs that
// directly, so a stale copy is never shipped inside MIM's own installer.
const SOURCES = {
  vjoy: {
    name: 'vJoy',
    infoUrl: 'https://sourceforge.net/projects/vjoystick/best_release.json',
    parse(data) {
      const release = data.platform_releases?.windows ?? data.release;
      if (!release?.url) throw new Error('No Windows release found for vJoy.');
      return {
        version: path.basename(path.dirname(release.filename)),
        downloadUrl: release.url,
        fileName: path.basename(release.filename)
      };
    }
  },
  hidhide: {
    name: 'HidHide',
    infoUrl: 'https://api.github.com/repos/nefarius/HidHide/releases/latest',
    parse(data) {
      const asset = data.assets?.find((a) => a.name.endsWith('.exe'));
      if (!asset) throw new Error('No installer found in the latest HidHide release.');
      return { version: data.tag_name, downloadUrl: asset.browser_download_url, fileName: asset.name };
    }
  }
};

function fetchJson(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    clientFor(url)
      .get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
        if (REDIRECT_CODES.includes(res.statusCode) && res.headers.location && redirects > 0) {
          res.resume();
          resolve(fetchJson(res.headers.location, redirects - 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Request failed with status ${res.statusCode}.`));
          return;
        }
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Could not parse the response.'));
          }
        });
      })
      .on('error', reject);
  });
}

function downloadFile(url, destPath, redirects = 5) {
  return new Promise((resolve, reject) => {
    clientFor(url)
      .get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
        if (REDIRECT_CODES.includes(res.statusCode) && res.headers.location && redirects > 0) {
          res.resume();
          resolve(downloadFile(res.headers.location, destPath, redirects - 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Download failed with status ${res.statusCode}.`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

async function getLatest(key) {
  const source = SOURCES[key];
  if (!source) throw new Error(`Unknown driver: ${key}`);
  const data = await fetchJson(source.infoUrl);
  return { name: source.name, ...source.parse(data) };
}

async function downloadAndRun(key) {
  const info = await getLatest(key);
  const destPath = path.join(os.tmpdir(), info.fileName);
  await downloadFile(info.downloadUrl, destPath);
  // vJoy's and HidHide's installers request elevation themselves via their
  // own manifest, so MIM doesn't need its own UAC wrapper here.
  spawn(destPath, [], { detached: true, stdio: 'ignore' }).unref();
  return info;
}

module.exports = { getLatest, downloadAndRun };
