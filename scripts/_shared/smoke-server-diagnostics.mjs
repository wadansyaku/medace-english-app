import { open } from 'node:fs/promises';

const MAX_LOG_BYTES = 256 * 1024;

export const classifyWranglerFailureLog = (text) => {
  const signatures = [];
  if (text.includes('Error inside ProxyWorker') && text.includes('Network connection lost.')) {
    signatures.push('PROXY_CONNECTION_LOST');
  }
  if (text.includes('The Workers runtime crashed unexpectedly and is being restarted')) {
    signatures.push('RUNTIME_CRASH');
  }
  if (/\bSQLITE_BUSY\b/.test(text)) signatures.push('SQLITE_BUSY');
  return signatures.length ? signatures : ['UNKNOWN'];
};

// Debug logs can contain bindings and request data. Only fixed classifications
// leave this helper; even file errors must never expose their message or path.
export const readSmokeServerDiagnostic = async (logPath) => {
  let file;
  try {
    file = await open(logPath, 'r');
    const { size } = await file.stat();
    const length = Math.min(size, MAX_LOG_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, Math.max(0, size - length));
    return {
      type: 'smoke_server_diagnostic',
      logStatus: 'read',
      inspectedBytes: bytesRead,
      truncated: size > MAX_LOG_BYTES,
      signatures: classifyWranglerFailureLog(buffer.toString('utf8', 0, bytesRead)),
    };
  } catch (error) {
    return {
      type: 'smoke_server_diagnostic',
      logStatus: error?.code === 'ENOENT' ? 'missing' : 'unreadable',
      signatures: ['UNKNOWN'],
    };
  } finally {
    await file?.close().catch(() => {});
  }
};
