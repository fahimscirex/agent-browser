import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-browser-version-sync-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = [
    'package.json',
    'cli/Cargo.toml',
    'packages/dashboard/package.json',
    'packages/@agent-browser/sandbox/package.json',
    'packages/@agent-browser/sandbox/src/version.ts',
    'packages/@agent-browser/eve/package.json',
    'scripts/sync-version.js',
    'scripts/check-version-sync.js',
  ];
  for (const file of files) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await cp(join(root, file), join(dir, file));
  }
  return dir;
}

async function editPackage(dir, file, update) {
  const path = join(dir, file);
  const pkg = JSON.parse(await readFile(path, 'utf8'));
  update(pkg);
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

function check(dir) {
  return spawnSync(process.execPath, ['scripts/check-version-sync.js'], {
    cwd: dir,
    encoding: 'utf8',
  });
}

test('CLI version sync preserves the independent eve version, tag and compiler pin', async (t) => {
  const dir = await fixture(t);
  const file = 'packages/@agent-browser/eve/package.json';
  await editPackage(dir, file, (pkg) => {
    pkg.version = '0.40.0-next.42';
    pkg.dependencies['@agent-browser/sandbox'] = '^0.1.0';
  });
  const before = JSON.parse(await readFile(join(dir, file), 'utf8'));
  execFileSync(process.execPath, ['scripts/sync-version.js'], { cwd: dir });
  const after = JSON.parse(await readFile(join(dir, file), 'utf8'));
  assert.equal(after.version, before.version);
  assert.deepEqual(after.publishConfig, before.publishConfig);
  assert.deepEqual(after.devDependencies, before.devDependencies);
  assert.equal(after.dependencies['@agent-browser/sandbox'], 'workspace:^');
  assert.equal(check(dir).status, 0);
});

for (const tag of [undefined, 'latest']) {
  test(`eve prerelease cannot publish with ${tag ?? 'an implicit latest'} tag`, async (t) => {
    const dir = await fixture(t);
    await editPackage(dir, 'packages/@agent-browser/eve/package.json', (pkg) => {
      pkg.version = '0.40.0-next.42';
      if (tag === undefined) delete pkg.publishConfig.tag;
      else pkg.publishConfig.tag = tag;
    });
    const result = check(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /prereleases must use an explicit non-latest/);
  });
}

test('stable eve releases can be versioned independently', async (t) => {
  const dir = await fixture(t);
  await editPackage(dir, 'packages/@agent-browser/eve/package.json', (pkg) => {
    pkg.version = '0.40.0';
    pkg.publishConfig.tag = 'latest';
  });
  assert.equal(check(dir).status, 0);
});

test('CLI, dashboard and sandbox versions still have to match', async (t) => {
  const dir = await fixture(t);
  await editPackage(dir, 'packages/dashboard/package.json', (pkg) => {
    pkg.version = '0.0.1';
  });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /packages\/dashboard/);
});
