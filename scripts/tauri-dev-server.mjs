import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

// Vite binds localhost (often ::1 on Windows); using 127.0.0.1 here would
// miss an existing server and incorrectly start a second one.
const HOST = 'localhost';
const PORT = 1420;
const WAIT_MS = 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function canConnect() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

function looksLikeVite() {
  return new Promise(resolve => {
    const request = http.get({ host: HOST, port: PORT, path: '/', timeout: 800 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 32_000) response.destroy(); });
      response.on('end', () => resolve(body.includes('/@vite/client') || body.includes('vite')));
      response.on('close', () => resolve(body.includes('/@vite/client') || body.includes('vite')));
    });
    request.once('error', () => resolve(false));
    request.setTimeout(800, () => { request.destroy(); resolve(false); });
  });
}

function startVite() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'dev'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  child.once('exit', (code, signal) => {
    if (signal) console.error(`[tauri-dev] Vite 被 ${signal} 终止，保持命令行等待下次启动。`);
    else if (code !== 0) console.error(`[tauri-dev] Vite 退出码 ${code ?? 'unknown'}，不会让守护命令瞬间退出。`);
  });
  return child;
}

let child = null;
let stopping = false;
const stop = () => {
  stopping = true;
  if (child && !child.killed) child.kill();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

while (!stopping) {
  if (await canConnect()) {
    if (await looksLikeVite()) {
      console.log(`[tauri-dev] Vite 已在 ${HOST}:${PORT} 运行，复用现有服务。`);
      while (!stopping) await sleep(5000);
      break;
    }
    console.warn(`[tauri-dev] ${PORT} 已被其他服务占用，等待端口释放后启动 Vite。`);
    await sleep(WAIT_MS);
    continue;
  }
  child = startVite();
  await new Promise(resolve => child.once('exit', resolve));
  child = null;
  if (!stopping) await sleep(WAIT_MS);
}
