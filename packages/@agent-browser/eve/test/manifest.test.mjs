import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ships a format-3 distribution with truthful compiler provenance', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../dist/extension/_manifest.json', import.meta.url), 'utf8')
  );
  const compiler = JSON.parse(
    await readFile(new URL('../node_modules/eve/package.json', import.meta.url), 'utf8')
  );
  assert.equal(manifest.kind, 'eve-extension');
  assert.equal(manifest.formatVersion, 3);
  assert.equal(manifest.contractMajor, 0);
  assert.equal(manifest.builtWithEve, compiler.version);
  assert.equal('requires' in manifest, false);
});
