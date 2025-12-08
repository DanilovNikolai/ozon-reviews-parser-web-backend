const fs = require('fs');
const path = require('path');

const LOCK_DIR = '/tmp/ozon-parser';

// создаём директорию если нет
if (!fs.existsSync(LOCK_DIR)) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
}

function lockPath(name) {
  return path.join(LOCK_DIR, `${name}.lock`);
}

function createLock(name, ttlMinutes = 30, meta = {}) {
  const p = lockPath(name);

  const data = {
    ...meta,
    pid: process.pid,
    timestamp: Date.now(),
    expires: Date.now() + ttlMinutes * 60_000,
  };

  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return true;
}

function readLock(name) {
  const p = lockPath(name);
  if (!fs.existsSync(p)) return null;

  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isActiveLock(name) {
  const lock = readLock(name);
  if (!lock) return false;

  if (Date.now() > lock.expires) {
    try {
      fs.unlinkSync(lockPath(name));
    } catch {}
    return false;
  }

  return true;
}

function removeLock(name) {
  const p = lockPath(name);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
}

module.exports = {
  createLock,
  readLock,
  isActiveLock,
  removeLock,
};
