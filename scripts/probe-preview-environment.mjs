import tls from 'node:tls';
import { URL } from 'node:url';

const args = process.argv.slice(2);

function argValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Preview environment probe

Usage:
  PREVIEW_API_URL=https://preview.example.com/api/v1 pnpm preview:probe

Optional:
  PREVIEW_METRICS_TOKEN=...   Verify authenticated /metrics access.
  PREVIEW_PROBE_PHONE=...     Phone used only for fixed-code rejection check.
  PREVIEW_PRIVACY_POLICY_URL=... or EXPO_PUBLIC_PRIVACY_POLICY_URL=...
  PREVIEW_TERMS_URL=... or EXPO_PUBLIC_TERMS_URL=...
  --json                      Print JSON only.
  --url <url>                 Override PREVIEW_API_URL.
  --privacy-url <url>         Override privacy policy URL.
  --terms-url <url>           Override terms URL.
`);
  process.exit(0);
}

const jsonOnly = args.includes('--json');
const apiUrlInput = argValue('--url') ?? process.env.PREVIEW_API_URL;
const metricsToken = process.env.PREVIEW_METRICS_TOKEN ?? process.env.METRICS_TOKEN;
const probePhone = process.env.PREVIEW_PROBE_PHONE ?? '19900000000';
const timeoutMs = Number(process.env.PREVIEW_PROBE_TIMEOUT_MS ?? 10_000);
const legalUrlInputs = {
  privacyPolicy:
    argValue('--privacy-url') ??
    process.env.PREVIEW_PRIVACY_POLICY_URL ??
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  terms:
    argValue('--terms-url') ?? process.env.PREVIEW_TERMS_URL ?? process.env.EXPO_PUBLIC_TERMS_URL,
};

const checks = [];

function record(name, ok, detail, extra = {}) {
  checks.push({ name, ok, detail, ...extra });
}

function fail(message) {
  record('configuration', false, message);
  finish();
  process.exit(process.exitCode ?? 1);
}

function finish() {
  const summary = {
    ok: checks.every((check) => check.ok || check.skipped),
    checked: checks.filter((check) => !check.skipped).length,
    skipped: checks.filter((check) => check.skipped).length,
    failed: checks.filter((check) => !check.ok && !check.skipped).length,
  };
  if (jsonOnly) {
    console.log(JSON.stringify({ summary, checks }, null, 2));
  } else {
    console.log('Preview 环境探针');
    for (const check of checks) {
      const marker = check.skipped ? '-' : check.ok ? '✓' : '✗';
      console.log(`${marker} ${check.name}: ${check.detail}`);
    }
    console.log(
      `结果：${summary.ok ? '通过' : '失败'}（检查 ${summary.checked}，跳过 ${summary.skipped}，失败 ${summary.failed}）`,
    );
  }
  if (!summary.ok) process.exitCode = 1;
}

if (!apiUrlInput)
  fail('PREVIEW_API_URL is required, for example https://preview.example.com/api/v1');

const apiUrl = parseApiUrl(apiUrlInput);
if (!apiUrl) fail(`Invalid PREVIEW_API_URL: ${apiUrlInput}`);

const apiUrlSafety = validatePreviewApiUrl(apiUrl);
record('previewApiUrl', apiUrlSafety.ok, apiUrlSafety.detail);
if (!apiUrlSafety.ok) {
  finish();
  process.exit(process.exitCode ?? 1);
}

const publicRoot = publicRootFromApi(apiUrl);

await checkTlsVersion();
await checkHealth('health/live', 'apiLive', (body) => unwrap(body)?.status === 'ok');
await checkHealth('health/ready', 'apiReady', (body) => {
  const data = unwrap(body);
  return (
    data?.status === 'ready' &&
    data?.dependencies?.postgres === 'ok' &&
    data?.dependencies?.redis === 'ok'
  );
});
await checkSwaggerClosed();
await checkMetricsUnauthorized();
await checkMetricsAuthorized();
await checkFixedDevelopmentOtpDisabled();
await checkLegalDocuments();

finish();

function parseApiUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function validatePreviewApiUrl(url) {
  const hostname = url.hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
  if (url.protocol !== 'https:') return { ok: false, detail: 'Preview API must use HTTPS' };
  if (localHosts.has(hostname)) return { ok: false, detail: 'Preview API must not be local' };
  if (!url.pathname.replace(/\/+$/, '').endsWith('/api/v1'))
    return { ok: false, detail: 'Preview API URL must end with /api/v1' };
  if (url.username || url.password || url.search || url.hash)
    return { ok: false, detail: 'Preview API URL must not include credentials, query or hash' };
  return { ok: true, detail: url.toString() };
}

function validatePublicHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, detail: `${label} must be an absolute URL` };
  }
  const hostname = url.hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
  if (url.protocol !== 'https:') return { ok: false, detail: `${label} must use HTTPS` };
  if (localHosts.has(hostname)) return { ok: false, detail: `${label} must not be local` };
  if (url.username || url.password || url.search || url.hash)
    return { ok: false, detail: `${label} must not include credentials, query or hash` };
  return { ok: true, url, detail: url.toString() };
}

function publicRootFromApi(url) {
  const root = new URL(url.toString());
  root.pathname = root.pathname.replace(/\/api\/v1\/?$/, '/');
  root.search = '';
  root.hash = '';
  return root;
}

function apiEndpoint(path) {
  const endpoint = new URL(apiUrl.toString());
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint;
}

function rootEndpoint(path) {
  const endpoint = new URL(publicRoot.toString());
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint;
}

async function checkTlsVersion() {
  try {
    const protocol = await detectTlsProtocol(apiUrl);
    const ok = protocol === 'TLSv1.2' || protocol === 'TLSv1.3';
    record(
      'tlsAtLeast12',
      ok,
      ok ? protocol : `Unsupported TLS protocol: ${protocol ?? 'unknown'}`,
    );
  } catch (error) {
    record('tlsAtLeast12', false, error instanceof Error ? error.message : String(error));
  }
}

function detectTlsProtocol(url) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: url.hostname,
      timeout: timeoutMs,
      ALPNProtocols: ['http/1.1'],
    });

    socket.once('secureConnect', () => {
      const protocol = socket.getProtocol();
      socket.destroy();
      resolve(protocol);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`TLS handshake timed out after ${timeoutMs}ms`));
    });
    socket.once('error', (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new globalThis.AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await globalThis.fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        ...(options.headers ?? {}),
      },
    });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrap(body) {
  return body?.data ?? body;
}

async function checkHealth(path, name, predicate) {
  const url = apiEndpoint(path);
  try {
    const response = await fetchWithTimeout(url);
    const body = await readBody(response);
    record(
      name,
      response.status === 200 && predicate(body),
      `${response.status} ${url}; ${response.status === 200 ? 'body checked' : JSON.stringify(body)}`,
    );
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

async function checkSwaggerClosed() {
  const targets = [rootEndpoint('docs-json'), rootEndpoint('docs')];
  const results = [];
  for (const target of targets) {
    try {
      const response = await fetchWithTimeout(target);
      results.push({ url: target.toString(), status: response.status });
    } catch (error) {
      results.push({
        url: target.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const publiclyOpen = results.some((result) => result.status === 200);
  record(
    'swaggerClosed',
    !publiclyOpen,
    publiclyOpen
      ? `Swagger is publicly reachable: ${JSON.stringify(results)}`
      : `Swagger not publicly reachable: ${JSON.stringify(results)}`,
  );
}

async function checkMetricsUnauthorized() {
  const url = apiEndpoint('metrics');
  try {
    const response = await fetchWithTimeout(url, { headers: { accept: 'text/plain' } });
    const body = await readBody(response);
    record(
      'metricsRejectsAnonymous',
      response.status === 401 || response.status === 403,
      `${response.status} ${url}; ${typeof body === 'string' ? body.slice(0, 80) : JSON.stringify(body)}`,
    );
  } catch (error) {
    record(
      'metricsRejectsAnonymous',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function checkMetricsAuthorized() {
  if (!metricsToken) {
    record('metricsAcceptsBearer', true, 'PREVIEW_METRICS_TOKEN not provided', { skipped: true });
    return;
  }
  const url = apiEndpoint('metrics');
  try {
    const response = await fetchWithTimeout(url, {
      headers: { accept: 'text/plain', authorization: `Bearer ${metricsToken}` },
    });
    const body = await response.text();
    record(
      'metricsAcceptsBearer',
      response.status === 200 && /#\s+HELP|cat_diary_/.test(body),
      `${response.status} ${url}; metrics body ${body.length} bytes`,
    );
  } catch (error) {
    record('metricsAcceptsBearer', false, error instanceof Error ? error.message : String(error));
  }
}

async function checkFixedDevelopmentOtpDisabled() {
  const url = apiEndpoint('auth/sms/verify');
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: probePhone,
        code: '123456',
        device: { deviceId: 'preview-probe-fixed-otp', platform: 'UNKNOWN' },
      }),
    });
    const body = await readBody(response);
    record(
      'fixedDevelopmentOtpDisabled',
      response.status !== 200,
      response.status === 200
        ? 'Fixed development OTP was accepted'
        : `${response.status}; fixed code rejected as expected: ${JSON.stringify(body)}`,
    );
  } catch (error) {
    record(
      'fixedDevelopmentOtpDisabled',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function checkLegalDocuments() {
  const entries = [
    ['privacyPolicy', 'privacyPolicyPublic', legalUrlInputs.privacyPolicy],
    ['terms', 'termsPublic', legalUrlInputs.terms],
  ];

  for (const [label, checkName, value] of entries) {
    if (!value) {
      record(checkName, true, `${label} URL not provided`, { skipped: true });
      continue;
    }
    const validation = validatePublicHttpsUrl(value, label);
    if (!validation.ok) {
      record(checkName, false, validation.detail);
      continue;
    }
    await checkLegalDocument(checkName, validation.url);
  }
}

async function checkLegalDocument(checkName, url) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: { accept: 'text/html, text/plain;q=0.9, */*;q=0.8' },
    });
    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();
    const readable = /text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType);
    const hasVersion = /版本|Version|生效日期|Effective Date|发布日期|更新日期/i.test(body);
    const hasDeletionPath = /注销|删除账号|账号删除|账号注销|delete account|account deletion/i.test(
      body,
    );
    const ok = response.status === 200 && readable && hasVersion && hasDeletionPath;
    record(
      checkName,
      ok,
      ok
        ? `${response.status} ${url}; legal body ${body.length} bytes`
        : `${response.status} ${url}; content-type=${contentType}; version=${hasVersion}; deletion=${hasDeletionPath}`,
    );
  } catch (error) {
    record(checkName, false, error instanceof Error ? error.message : String(error));
  }
}
