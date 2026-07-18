import { spawnSync } from 'node:child_process';
import net from 'node:net';

const POSTGRES_PORT = 5433;
const REDIS_PORT = 6379;
const START_TIMEOUT_MS = 30_000;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`猫伴日记本地开发依赖启动

Usage:
  pnpm dev:deps

What it does:
  1. 检查 Docker daemon 是否运行。
  2. 检查本机 5433/PostgreSQL 与 6379/Redis 是否已有服务监听。
  3. 只通过 docker compose 启动缺失的 postgres/redis 服务，避免和本机已有 Redis 冲突。
  4. 执行 Prisma migration deploy。
  5. 打印后续 API、Metro 和 Android 预检命令。
`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  console.log('猫伴日记本地开发依赖启动');
  ensureDocker();

  const postgresListening = await isPortListening(POSTGRES_PORT);
  const redisListening = await isPortListening(REDIS_PORT);
  const services = [];
  if (!postgresListening) services.push('postgres');
  if (!redisListening) services.push('redis');

  if (services.length) {
    run('docker', ['compose', '-f', 'infra/docker-compose.yml', 'up', '-d', ...services]);
  } else {
    ok('PostgreSQL 5433 与 Redis 6379 已有服务监听，跳过 docker compose 启动。');
  }

  await waitForPort(POSTGRES_PORT, 'PostgreSQL 5433');
  await waitForPort(REDIS_PORT, 'Redis 6379');
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);

  console.log(`
开发依赖已就绪。

后续终端一：启动 API
  pnpm --filter @cat-diary/api dev

后续终端二：启动 Metro
  EXPO_PUBLIC_API_URL='http://127.0.0.1:3000/api/v1' \\
    pnpm --dir apps/mobile exec expo start --dev-client --lan --port 8081

Android 已连接并授权后：
  pnpm android:preflight -- --fix --launch
`);
}

function ensureDocker() {
  const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      [
        'Docker daemon 未运行，无法自动启动本地 PostgreSQL。',
        '请先打开 Docker Desktop，或执行：open -a Docker',
        detail ? `Docker 输出：${detail}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  ok(`Docker daemon 已运行：${result.stdout.trim()}`);
}

function run(command, args) {
  const display = [command, ...args].join(' ');
  console.log(`$ ${display}`);
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  if (result.status !== 0) throw new Error(`${display} 失败，退出码 ${result.status}`);
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port, label) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isPortListening(port)) {
      ok(`${label} 可访问。`);
      return;
    }
    await delay(1_000);
  }
  throw new Error(`${label} 在 ${START_TIMEOUT_MS / 1000} 秒内没有启动。`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ok(message) {
  console.log(`✓ ${message}`);
}
