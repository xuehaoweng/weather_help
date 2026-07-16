import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const harmonyRoot = join(process.cwd(), 'harmony');
const requiredFiles = [
  'build-profile.json5',
  'hvigorfile.ts',
  'oh-package.json5',
  'hvigor/hvigor-config.json5',
  'AppScope/app.json5',
  'entry/build-profile.json5',
  'entry/hvigorfile.ts',
  'entry/oh-package.json5',
  'entry/src/main/module.json5',
];

function readJson5(relativePath) {
  const source = readFileSync(join(harmonyRoot, relativePath), 'utf8');
  const value = runInNewContext(`(${source})`, Object.create(null));
  return JSON.parse(JSON.stringify(value));
}

test('HarmonyOS 6 HAP project keeps the required static contract', () => {
  for (const relativePath of requiredFiles) {
    assert.ok(
      existsSync(join(harmonyRoot, relativePath)),
      `missing harmony/${relativePath}`,
    );
  }

  const buildProfile = readJson5('build-profile.json5');
  const defaultProduct = buildProfile.app.products.find(
    ({ name }) => name === 'default',
  );

  assert.equal(defaultProduct.targetSdkVersion, '6.0.0(20)');
  assert.equal(defaultProduct.compatibleSdkVersion, '6.0.0(20)');
  assert.equal(defaultProduct.runtimeOS, 'HarmonyOS');
  assert.deepEqual(buildProfile.app.signingConfigs, []);

  const serializedSigningConfigs = JSON.stringify(
    buildProfile.app.signingConfigs,
  );
  assert.doesNotMatch(
    serializedSigningConfigs,
    /certificate|keyAlias|keyPassword|profile|signAlg|storeFile|storePassword/i,
  );

  const moduleConfig = readJson5('entry/src/main/module.json5').module;
  assert.equal(moduleConfig.type, 'entry');
  assert.deepEqual(moduleConfig.deviceTypes, ['phone']);
  assert.deepEqual(moduleConfig.requestPermissions, [
    { name: 'ohos.permission.INTERNET' },
  ]);
});
