import { spawn } from 'node:child_process';

export const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export const createProcessManager = (cwd, baseEnv = process.env) => {
  const { FORCE_COLOR: _forceColor, ...sanitizedBaseEnv } = baseEnv;
  const managedChildren = [];

  const spawnCommand = (command, commandArgs, options = {}) => spawn(command, commandArgs, {
    cwd,
    env: {
      ...sanitizedBaseEnv,
      ...options.env,
    },
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  const runCommand = (command, commandArgs, options = {}) => new Promise((resolve, reject) => {
    const child = spawnCommand(command, commandArgs, options);
    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        if (options.printOutput) process.stdout.write(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (options.printOutput) process.stderr.write(chunk);
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${commandArgs.join(' ')} failed with code ${code}\n${stderr || stdout}`));
    });
  });

  const tryRunCommand = async (command, commandArgs, options = {}) => {
    try {
      const result = await runCommand(command, commandArgs, options);
      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      return {
        ok: false,
        stdout: '',
        stderr: String(error),
        error,
      };
    }
  };

  const runJsonCommand = async (command, commandArgs, options = {}) => {
    const { stdout } = await runCommand(command, commandArgs, options);
    return JSON.parse(stdout);
  };

  const startManagedProcess = async (name, command, commandArgs, readyPattern) => {
    const child = spawnCommand(command, commandArgs);
    let logs = '';

    managedChildren.push(child);

    const ready = new Promise((resolve, reject) => {
      const onData = (chunk) => {
        const text = chunk.toString();
        logs += text;
        process.stdout.write(text);
        if (readyPattern.test(text)) {
          resolve();
        }
      };

      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('error', reject);
      child.on('close', (code) => {
        reject(new Error(`${name} exited before becoming ready (code ${code ?? 'null'})\n${logs}`));
      });
    });

    await ready;
    return {
      child,
      getLogs: () => logs,
    };
  };

  const cleanup = async () => {
    await Promise.all(managedChildren.map((child) => new Promise((resolve) => {
      if (child.killed || child.exitCode !== null) {
        resolve();
        return;
      }

      child.once('close', () => resolve());
      if (child.pid) {
        try {
          if (process.platform === 'win32') child.kill('SIGTERM');
          else process.kill(-child.pid, 'SIGTERM');
        } catch {
          resolve();
          return;
        }
      }
      setTimeout(() => {
        if (child.exitCode === null) {
          try {
            if (process.platform === 'win32') child.kill('SIGKILL');
            else process.kill(-child.pid, 'SIGKILL');
          } catch {
            resolve();
          }
        }
      }, 2000);
    })));
  };

  return {
    managedChildren,
    spawnCommand,
    runCommand,
    tryRunCommand,
    runJsonCommand,
    startManagedProcess,
    cleanup,
  };
};

export default createProcessManager;
