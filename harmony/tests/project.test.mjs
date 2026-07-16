import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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

function listProjectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    return entry.isDirectory() ? listProjectFiles(absolutePath) : [absolutePath];
  });
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
  assert.equal(defaultProduct.signingConfig, 'default');
  assert.deepEqual(buildProfile.app.signingConfigs, []);

  const projectTexts = listProjectFiles(harmonyRoot)
    .filter((filePath) => !relative(harmonyRoot, filePath).startsWith('tests/'))
    .map(
      (filePath) =>
        `${relative(harmonyRoot, filePath)}\n${readFileSync(filePath, 'utf8')}`,
    )
    .join('\n');
  assert.doesNotMatch(
    projectTexts,
    /storeFile|storePassword|keyPassword|certpath|\.p12\b|\.p7b\b|\.cer\b|\.profile\b/i,
  );

  const appHvigorfile = readFileSync(
    join(harmonyRoot, 'hvigorfile.ts'),
    'utf8',
  );
  const entryHvigorfile = readFileSync(
    join(harmonyRoot, 'entry/hvigorfile.ts'),
    'utf8',
  );
  assert.match(appHvigorfile, /plugins:\s*\[\s*\]/);
  assert.match(entryHvigorfile, /plugins:\s*\[\s*\]/);

  const hvigorConfig = readJson5('hvigor/hvigor-config.json5');
  assert.equal(hvigorConfig.execution.typeCheck, true);
  assert.equal(hvigorConfig.execution.analyze, 'normal');
  assert.equal(hvigorConfig.logging.level, 'info');

  const rootPackage = readJson5('oh-package.json5');
  assert.equal(rootPackage.description, 'Weather Pro HarmonyOS shell');

  const entryPackage = readJson5('entry/oh-package.json5');
  assert.equal(entryPackage.description, 'Weather Pro entry HAP');
  assert.equal(entryPackage.main, '');
  assert.equal(entryPackage.author, 'xuehaoweng');

  const entryBuildProfile = readJson5('entry/build-profile.json5');
  const releaseBuild = entryBuildProfile.buildOptionSet.find(
    ({ name }) => name === 'release',
  );
  assert.deepEqual(
    releaseBuild.arkOptions.obfuscation.ruleOptions.consumerFiles,
    [],
  );

  const moduleConfig = readJson5('entry/src/main/module.json5').module;
  assert.equal(moduleConfig.type, 'entry');
  assert.deepEqual(moduleConfig.deviceTypes, ['phone']);
  const homeSkill = moduleConfig.abilities
    .find(({ name }) => name === 'EntryAbility')
    .skills.find(({ actions }) => actions.includes('ohos.want.action.home'));
  assert.ok(homeSkill);
  assert.deepEqual(homeSkill.actions, ['ohos.want.action.home']);
  assert.deepEqual(moduleConfig.requestPermissions, [
    { name: 'ohos.permission.INTERNET' },
  ]);
});
