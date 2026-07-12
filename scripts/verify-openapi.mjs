import { readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

const endpoint = process.env.OPENAPI_URL ?? 'http://127.0.0.1:3000/docs-json';
const snapshotPath = new URL('../openapi.json', import.meta.url);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  return value;
}

const response = await fetch(endpoint);
if (!response.ok) throw new Error(`OpenAPI endpoint returned ${response.status}`);
const currentDocument = stable(await response.json());
const current = `${JSON.stringify(currentDocument, null, 2)}\n`;

if (process.env.UPDATE_OPENAPI === '1') {
  await writeFile(snapshotPath, current);
  console.log('OPENAPI_SNAPSHOT_UPDATED');
} else {
  const expectedDocument = stable(JSON.parse(await readFile(snapshotPath, 'utf8')));
  if (JSON.stringify(currentDocument) !== JSON.stringify(expectedDocument))
    throw new Error('OpenAPI contract changed. Review it, then run pnpm openapi:update.');
  console.log('OPENAPI_CONTRACT_OK');
}
