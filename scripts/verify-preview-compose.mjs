import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const composePath = resolve(root, 'infra/docker-compose.preview.yml');
const apiDockerfilePath = resolve(root, 'apps/api/Dockerfile');
const workerDockerfilePath = resolve(root, 'apps/worker/Dockerfile');

const errors = [];

if (!existsSync(composePath)) errors.push(`缺少 Preview Compose 文件：${composePath}`);
if (!existsSync(apiDockerfilePath)) errors.push(`缺少 API Dockerfile：${apiDockerfilePath}`);
if (!existsSync(workerDockerfilePath))
  errors.push(`缺少 Worker Dockerfile：${workerDockerfilePath}`);

const compose = existsSync(composePath) ? readFileSync(composePath, 'utf8') : '';
const services = parseServices(compose);

expectServices(['migrate', 'api', 'worker']);

expectServiceLine('migrate', 'image: ${API_IMAGE:?API_IMAGE is required}');
expectServiceLine('migrate', "restart: 'no'");
expectServiceLine('migrate', 'env_file: ${ENV_FILE:-../.env.preview}');
expectServiceLine(
  'migrate',
  "command: ['./node_modules/.bin/prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']",
);
expectServiceNoKey('migrate', 'ports');
expectServiceNoKey('migrate', 'volumes');
expectServiceNoDangerousRuntimeOptions('migrate');

expectServiceLine('api', 'image: ${API_IMAGE:?API_IMAGE is required}');
expectServiceLine('api', 'restart: unless-stopped');
expectServiceLine('api', 'init: true');
expectServiceLine('api', 'env_file: ${ENV_FILE:-../.env.preview}');
expectServiceLine('api', 'ports:');
expectServiceLine('api', "- '${API_BIND_ADDRESS:-127.0.0.1}:${API_PORT:-3000}:3000'");
expectServiceLine('api', 'depends_on:');
expectServiceLine('api', 'migrate:');
expectServiceLine('api', 'condition: service_completed_successfully');
expectServiceHardening('api');
expectServiceResourceLimits('api', '768M', "'1.0'");
expectServiceNoKey('api', 'volumes');
expectServiceNoDangerousRuntimeOptions('api');

expectServiceLine('worker', 'image: ${WORKER_IMAGE:?WORKER_IMAGE is required}');
expectServiceLine('worker', 'restart: unless-stopped');
expectServiceLine('worker', 'init: true');
expectServiceLine('worker', 'env_file: ${ENV_FILE:-../.env.preview}');
expectServiceLine('worker', 'depends_on:');
expectServiceLine('worker', 'migrate:');
expectServiceLine('worker', 'condition: service_completed_successfully');
expectServiceHardening('worker');
expectServiceResourceLimits('worker', '1G', "'1.0'");
expectServiceNoKey('worker', 'ports');
expectServiceNoKey('worker', 'volumes');
expectServiceNoDangerousRuntimeOptions('worker');

expectDockerfile(apiDockerfilePath, [
  'FROM node:24-bookworm-slim AS runtime',
  'RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx',
  'USER node',
  'EXPOSE 3000',
  'HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3',
  "fetch('http://127.0.0.1:3000/api/v1/health/ready')",
  'CMD ["node", "dist/main.js"]',
]);

expectDockerfile(workerDockerfilePath, [
  'FROM node:24-bookworm-slim AS runtime',
  'RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx',
  'USER node',
  'HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3',
  "fetch('http://127.0.0.1:'+(process.env.WORKER_PORT||3001)+'/health/ready')",
  'CMD ["node", "dist/main.js"]',
]);

if (errors.length > 0) {
  console.error('PREVIEW_COMPOSE_INVALID');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `PREVIEW_COMPOSE_OK ${JSON.stringify({
    compose: composePath,
    services: Object.keys(services),
    dockerfiles: [apiDockerfilePath, workerDockerfilePath],
  })}`,
);

function parseServices(raw) {
  const lines = raw.split(/\r?\n/);
  const servicesLine = lines.findIndex((line) => line === 'services:');
  if (servicesLine === -1) {
    errors.push('Preview Compose 缺少顶层 services');
    return {};
  }

  const parsed = {};
  for (let index = servicesLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && !line.startsWith('  ')) break;
    const match = line.match(/^ {2}([a-z][a-z0-9-]*):\s*$/);
    if (!match) continue;

    const [, serviceName] = match;
    const nextService = findNextServiceLine(lines, index + 1);
    parsed[serviceName] = lines.slice(index, nextService).join('\n');
    index = nextService - 1;
  }
  return parsed;
}

function findNextServiceLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && !line.startsWith('  ')) return index;
    if (/^ {2}[a-z][a-z0-9-]*:\s*$/.test(line)) return index;
  }
  return lines.length;
}

function expectServices(expected) {
  const actual = Object.keys(services);
  const missing = expected.filter((service) => !actual.includes(service));
  const unexpected = actual.filter((service) => !expected.includes(service));
  for (const service of missing) errors.push(`Preview Compose 缺少服务 ${service}`);
  for (const service of unexpected) errors.push(`Preview Compose 不应包含未登记服务 ${service}`);
}

function serviceLines(serviceName) {
  const block = services[serviceName];
  if (!block) return [];
  return block.split(/\r?\n/).map((line) => line.trim());
}

function expectServiceLine(serviceName, expectedLine) {
  if (!services[serviceName]) return;
  if (!serviceLines(serviceName).includes(expectedLine))
    errors.push(`${serviceName} 缺少配置：${expectedLine}`);
}

function expectServiceNoKey(serviceName, key) {
  const block = services[serviceName];
  if (!block) return;
  const pattern = new RegExp(`^\\s{4}${escapeRegExp(key)}\\s*:`, 'm');
  if (pattern.test(block)) errors.push(`${serviceName} 不应配置 ${key}`);
}

function expectServiceHardening(serviceName) {
  expectServiceLine(serviceName, 'read_only: true');
  expectServiceLine(serviceName, 'tmpfs:');
  expectServiceLine(serviceName, 'security_opt:');
  expectServiceLine(serviceName, '- no-new-privileges:true');
  expectServiceLine(serviceName, 'cap_drop:');
  expectServiceLine(serviceName, '- ALL');
  expectServiceLine(serviceName, 'deploy:');
  expectServiceLine(serviceName, 'resources:');
  expectServiceLine(serviceName, 'limits:');
}

function expectServiceResourceLimits(serviceName, memory, cpus) {
  expectServiceLine(serviceName, `memory: ${memory}`);
  expectServiceLine(serviceName, `cpus: ${cpus}`);
}

function expectServiceNoDangerousRuntimeOptions(serviceName) {
  const block = services[serviceName];
  if (!block) return;
  for (const line of ['privileged: true', 'network_mode: host', 'pid: host', 'ipc: host']) {
    if (serviceLines(serviceName).includes(line)) errors.push(`${serviceName} 禁止配置 ${line}`);
  }
}

function expectDockerfile(path, requiredFragments) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const fragment of requiredFragments) {
    if (!raw.includes(fragment)) errors.push(`${path} 缺少片段：${fragment}`);
  }
  if (/HEALTHCHECK\s+NONE/.test(raw)) errors.push(`${path} 禁止关闭 HEALTHCHECK`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
