const { getFormattedTimestamp } = require('./getFormattedTimestamp');

let logBuffer = [];

function logWithCapture(...args) {
  const timestamp = getFormattedTimestamp();
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const line = `${timestamp} ${text}`;
  logBuffer.push(line);
  console.log(...args);
}

function warnWithCapture(...args) {
  const timestamp = getFormattedTimestamp();
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const line = `${timestamp} [WARN] ${text}`;
  logBuffer.push(line);
  console.warn(...args);
}

function errorWithCapture(...args) {
  const timestamp = getFormattedTimestamp();
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const line = `${timestamp} [ERROR] ${text}`;
  logBuffer.push(line);
  console.error(...args);
}

function getLogBuffer() {
  return logBuffer;
}

module.exports = {
  logWithCapture,
  warnWithCapture,
  errorWithCapture,
  getLogBuffer,
};
