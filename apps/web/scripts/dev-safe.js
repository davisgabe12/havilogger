#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const lockFile = path.join(projectRoot, '.next', 'dev', 'lock');
const nextBin = path.join(projectRoot, 'node_modules', '.bin', 'next');

function parseArgs() {
  const rawArgs = process.argv.slice(2);
  const cleanedArgs = [];
  let portFromFlag;
  let hostFromFlag;

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (arg === '--port' || arg === '-p') {
      portFromFlag = rawArgs[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--port=')) {
      portFromFlag = arg.split('=')[1];
      continue;
    }

    if (arg === '--host' || arg === '-H' || arg === '--hostname') {
      hostFromFlag = rawArgs[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--host=')) {
      hostFromFlag = arg.split('=')[1];
      continue;
    }

    if (arg.startsWith('--hostname=')) {
      hostFromFlag = arg.split('=')[1];
      continue;
    }

    cleanedArgs.push(arg);
  }

  const envPort = process.env.PORT || process.env.DEV_PORT;
  const host = hostFromFlag || process.env.HOST || '127.0.0.1';
  const port = Number(portFromFlag || envPort) || 3000;

  return { port, host, forwardedArgs: cleanedArgs };
}

function removeLockIfPresent() {
  try {
    fs.rmSync(lockFile, { force: true });
  } catch (err) {
    console.warn('Could not remove dev lock file:', err.message);
  }
}

function findPortProcesses(port) {
  try {
    const output = execSync(`lsof -i :${port} -sTCP:LISTEN -n -P`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 2)
      .map(([command, pid]) => ({ command, pid }));
  } catch {
    return [];
  }
}

function ensurePortFree(port) {
  const processes = findPortProcesses(port);
  if (processes.length === 0) return;

  console.error(`Port ${port} is already in use.`);
  processes.forEach(({ pid, command }) => {
    console.error(`PID ${pid} (${command}) is listening. Stop it with: kill ${pid}`);
  });
  process.exit(1);
}

function startDevServer(port, host, forwardedArgs) {
  const args = ['dev', '-H', host, '-p', String(port), ...forwardedArgs];
  const child = spawn(nextBin, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port), HOST: host },
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

const { port, host, forwardedArgs } = parseArgs();

removeLockIfPresent();
ensurePortFree(port);
startDevServer(port, host, forwardedArgs);
