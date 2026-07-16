import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, parse, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const harmonyRoot = dirname(testsRoot);
const repoRoot = dirname(harmonyRoot);
const forbiddenSigningExtensions = new Set([
  '.p12',
  '.p7b',
  '.cer',
  '.profile',
  '.pem',
  '.key',
  '.jks',
  '.keystore',
]);
const textFileExtensions = new Set([
  '.ets',
  '.json',
  '.json5',
  '.md',
  '.mjs',
  '.ts',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);
const requiredFiles = [
  'build-profile.json5',
  'hvigorfile.ts',
  'oh-package.json5',
  'hvigor/hvigor-config.json5',
  'AppScope/app.json5',
  'AppScope/resources/base/element/string.json',
  'AppScope/resources/base/media/app_icon.svg',
  'entry/build-profile.json5',
  'entry/hvigorfile.ts',
  'entry/obfuscation-rules.txt',
  'entry/oh-package.json5',
  'entry/src/main/module.json5',
  'entry/src/main/resources/base/element/color.json',
  'entry/src/main/resources/base/element/string.json',
  'entry/src/main/resources/base/media/app_icon.svg',
  'entry/src/main/resources/base/profile/main_pages.json',
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

function normalizedProjectPath(filePath) {
  return relative(harmonyRoot, filePath).replaceAll(sep, '/');
}

function listTrackedHarmonyFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '--', 'harmony'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);

  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((filePath) => join(repoRoot, filePath));
}

function assertTrackedHarmonyFilesAreSafe(projectFiles) {
  for (const filePath of projectFiles) {
    assert.equal(
      forbiddenSigningExtensions.has(extname(filePath).toLowerCase()),
      false,
      `forbidden signing file: harmony/${normalizedProjectPath(filePath)}`,
    );
  }

  const projectTexts = projectFiles
    .filter((filePath) => {
      const projectPath = normalizedProjectPath(filePath);
      return (
        !projectPath.startsWith('tests/') &&
        !projectPath.split('/').includes('build') &&
        textFileExtensions.has(extname(filePath).toLowerCase())
      );
    })
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n');
  assert.doesNotMatch(
    projectTexts,
    /storeFile|storePassword|keyPassword|keyPwd|keyAlias|certpath|certificate|signAlg/i,
  );
}

function collectResourceReferences(value, references = []) {
  if (typeof value === 'string') {
    const match = /^\$(string|color|media|profile):(.+)$/.exec(value);
    if (match) {
      references.push({ type: match[1], name: match[2] });
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectResourceReferences(item, references);
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectResourceReferences(item, references);
    }
  }

  return references;
}

function elementResourceNames(relativePath, type) {
  return new Set(readJson5(relativePath)[type].map(({ name }) => name));
}

function fileResourceNames(relativeDirectory) {
  return new Set(
    readdirSync(join(harmonyRoot, relativeDirectory), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => parse(entry.name).name),
  );
}

function assertResourceReferencesResolve(config, resources, scope) {
  for (const { type, name } of collectResourceReferences(config)) {
    assert.ok(
      resources[type]?.has(name),
      `missing ${scope} resource $${type}:${name}`,
    );
  }
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

  const entryModule = buildProfile.modules.find(({ name }) => name === 'entry');
  assert.equal(entryModule.srcPath, './entry');
  const rootDefaultTarget = entryModule.targets.find(
    ({ name }) => name === 'default',
  );
  assert.deepEqual(rootDefaultTarget.applyToProducts, ['default']);

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
  assert.equal(
    entryPackage.description,
    'Weather Pro HarmonyOS entry module',
  );
  assert.equal(entryPackage.main, '');
  assert.equal(entryPackage.author, 'xuehaoweng');

  const entryBuildProfile = readJson5('entry/build-profile.json5');
  assert.equal(entryBuildProfile.apiType, 'stageMode');
  assert.ok(
    entryBuildProfile.targets.some(({ name }) => name === 'default'),
    'entry build profile must declare the default target',
  );
  const releaseBuild = entryBuildProfile.buildOptionSet.find(
    ({ name }) => name === 'release',
  );
  assert.deepEqual(
    releaseBuild.arkOptions.obfuscation.consumerFiles,
    [],
  );
  assert.equal(
    Object.hasOwn(
      releaseBuild.arkOptions.obfuscation.ruleOptions,
      'consumerFiles',
    ),
    false,
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

test('AppScope resource references resolve to packaged resources', () => {
  const appConfig = readJson5('AppScope/app.json5').app;
  const resources = {
    string: elementResourceNames(
      'AppScope/resources/base/element/string.json',
      'string',
    ),
    media: fileResourceNames('AppScope/resources/base/media'),
  };

  assertResourceReferencesResolve(appConfig, resources, 'AppScope');
});

test('entry module resource references resolve to packaged resources', () => {
  const moduleConfig = readJson5('entry/src/main/module.json5').module;
  const resources = {
    string: elementResourceNames(
      'entry/src/main/resources/base/element/string.json',
      'string',
    ),
    color: elementResourceNames(
      'entry/src/main/resources/base/element/color.json',
      'color',
    ),
    media: fileResourceNames('entry/src/main/resources/base/media'),
    profile: fileResourceNames('entry/src/main/resources/base/profile'),
  };

  assertResourceReferencesResolve(moduleConfig, resources, 'entry');
});

test('HarmonyOS project excludes signing materials and sensitive fields', () => {
  const ignoredSigningPath = join(
    harmonyRoot,
    `.project-test-${randomUUID()}.p12`,
  );
  writeFileSync(ignoredSigningPath, 'ignored local signing material');

  try {
    const projectFiles = listTrackedHarmonyFiles();
    assert.equal(
      projectFiles.includes(ignoredSigningPath),
      false,
      'ignored local signing materials must not enter the tracked-file audit',
    );
    assertTrackedHarmonyFilesAreSafe(projectFiles);
    assert.throws(
      () => assertTrackedHarmonyFilesAreSafe([
        join(harmonyRoot, 'signing/forced-tracked.p12'),
      ]),
      /forbidden signing file: harmony\/signing\/forced-tracked\.p12/,
      'a force-tracked signing file must fail the audit',
    );
  } finally {
    unlinkSync(ignoredSigningPath);
  }
});

test('repository ignores DevEco output and HarmonyOS signing materials', () => {
  const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
  const requiredRules = [
    'harmony/.hvigor/',
    'harmony/.idea/',
    'harmony/local.properties',
    'harmony/oh_modules/',
    'harmony/**/build/',
    'harmony/**/*.hap',
    'harmony/**/*.app',
    'harmony/**/*.p12',
    'harmony/**/*.p7b',
    'harmony/**/*.cer',
    'harmony/**/*.profile',
    'harmony/**/*.pem',
    'harmony/**/*.key',
    'harmony/**/*.jks',
    'harmony/**/*.keystore',
  ];

  for (const rule of requiredRules) {
    assert.match(
      gitignore,
      new RegExp(`^${rule.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'),
      `missing .gitignore rule: ${rule}`,
    );
  }

  assert.doesNotMatch(
    gitignore,
    /^\*\*\/\*\.(?:hap|app|p12|p7b|cer|profile|pem|key|jks|keystore)$/m,
    'HarmonyOS package and signing rules must not ignore matching files repository-wide',
  );

  const ignoredPaths = [
    'harmony/demo.hap',
    'harmony/demo.app',
    'harmony/demo.p12',
    'harmony/demo.p7b',
    'harmony/demo.cer',
    'harmony/demo.profile',
    'harmony/demo.pem',
    'harmony/demo.key',
    'harmony/demo.jks',
    'harmony/demo.keystore',
  ];
  const checkIgnored = spawnSync(
    'git',
    ['check-ignore', ...ignoredPaths],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  assert.equal(checkIgnored.status, 0, checkIgnored.stderr);
  assert.deepEqual(
    checkIgnored.stdout.trim().split('\n'),
    ignoredPaths,
    'HarmonyOS package and signing artifacts must be ignored',
  );

  const checkNonHarmonyApp = spawnSync(
    'git',
    ['check-ignore', 'docs/demo.app'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  assert.equal(
    checkNonHarmonyApp.status,
    1,
    'non-HarmonyOS .app files must not be ignored by HarmonyOS rules',
  );
  assert.equal(checkNonHarmonyApp.stdout, '');
});

test('HarmonyOS README documents the DevEco signing and install flow', () => {
  const readmePath = join(harmonyRoot, 'README.md');
  assert.ok(existsSync(readmePath), 'missing harmony/README.md');

  const readme = readFileSync(readmePath, 'utf8');
  const requiredTopics = [
    /DevEco Studio 6/,
    /HarmonyOS 6/,
    /API 20/,
    /自动签名/,
    /https:\/\/43\.129\.249\.56\//,
    /不得提交.*(?:p12|\.p12)/is,
    /Build Hap\(s\)/,
    /真机.*(?:安装|运行)/is,
    /验收/,
    /故障排查/,
  ];

  for (const topic of requiredTopics) {
    assert.match(readme, topic);
  }

  const requiredWorkflowContracts = [
    {
      pattern: /(?:Open Project|选择 \*\*Open\*\*)/,
      message: 'README must explain how to open the project',
    },
    {
      pattern: /选择仓库中的 `harmony` 目录/,
      message: 'README must tell users to select the harmony directory',
    },
    {
      pattern: /\*\*Sync\*\*/,
      message: 'README must document DevEco project Sync',
    },
    {
      pattern: /华为开发者账号/,
      message: 'README must require a Huawei developer account',
    },
    {
      pattern: /签名材料只允许保存在开发机。不得提交/s,
      message: 'README must keep automatic signing local and uncommitted',
    },
    {
      pattern: /git check-ignore[\s\S]*(?:\.hap|\.app)/,
      message: 'README must verify generated HAP and APP artifacts are ignored',
    },
    {
      pattern: /git ls-files[\s\S]*(?:p12|p7b|cer|profile|pem|key|jks|keystore)/,
      message: 'README must verify signing materials are not tracked',
    },
    {
      pattern: /Build > Build Hap\(s\)\/APP\(s\) > Build Hap\(s\)/,
      message: 'README must document the Build Hap(s) menu action',
    },
    {
      pattern: /entry\/build\/default\/outputs\/default\//,
      message: 'README must document the exact Debug HAP output directory',
    },
    {
      pattern: /(?:Run 'entry'|hdc install)/,
      message: 'README must document real-device Run or HDC installation',
    },
    {
      pattern: /### ArkWeb 白屏/,
      message: 'README must troubleshoot an ArkWeb blank screen',
    },
    {
      pattern: /### Sync 或 Hvigor 失败/,
      message: 'README must troubleshoot Sync failures',
    },
    {
      pattern: /### 自动签名或安装失败/,
      message: 'README must troubleshoot signing failures',
    },
    {
      pattern: /### 只有部分天气数据/,
      message: 'README must troubleshoot partial weather data',
    },
  ];

  for (const { pattern, message } of requiredWorkflowContracts) {
    assert.match(readme, pattern, message);
  }
});

test('HarmonyOS app URL policy only trusts the configured HTTPS origin', () => {
  const appConfig = readFileSync(
    join(harmonyRoot, 'entry/src/main/ets/config/AppConfig.ets'),
    'utf8',
  );
  const executableAppConfig = appConfig
    .replace(/^export /gm, '')
    .replace(/: string\b/g, '')
    .replace(/\): boolean\b/g, ')');
  const {
    APP_URL,
    isTrustedAppUrl,
    isExternalHttpsUrl,
  } = new Function(
    `"use strict";
${executableAppConfig}
return { APP_URL, isTrustedAppUrl, isExternalHttpsUrl };`,
  )();

  assert.match(
    appConfig,
    /export const APP_URL: string = 'https:\/\/43\.129\.249\.56\/';/,
  );
  assert.match(
    appConfig,
    /return url === APP_URL \|\| url\.startsWith\(APP_URL\);/,
  );
  assert.match(
    appConfig,
    /return url\.startsWith\('https:\/\/'\) && !isTrustedAppUrl\(url\);/,
  );
  assert.doesNotMatch(appConfig, /http:\/\/43\.129\.249\.56/);

  assert.equal(APP_URL, 'https://43.129.249.56/');

  const trustedUrlCases = [
    [APP_URL, true],
    [`${APP_URL}forecast`, true],
    ['https://43.129.249.56.evil/', false],
    ['https://43.129.249.56@evil.example/', false],
    ['http://43.129.249.56/', false],
    ['javascript:alert(1)', false],
    ['data:text/html,unsafe', false],
    ['file:///etc/passwd', false],
  ];
  for (const [url, expected] of trustedUrlCases) {
    assert.equal(isTrustedAppUrl(url), expected, `trusted policy for ${url}`);
  }

  const externalUrlCases = [
    ['https://example.com/', true],
    [APP_URL, false],
    [`${APP_URL}forecast`, false],
    ['http://example.com/', false],
    ['javascript:alert(1)', false],
    ['data:text/html,unsafe', false],
    ['file:///etc/passwd', false],
  ];
  for (const [url, expected] of externalUrlCases) {
    assert.equal(
      isExternalHttpsUrl(url),
      expected,
      `external HTTPS policy for ${url}`,
    );
  }

  const productionEtsFiles = listProjectFiles(
    join(harmonyRoot, 'entry/src/main/ets'),
  ).filter((filePath) => extname(filePath) === '.ets');
  for (const filePath of productionEtsFiles) {
    assert.doesNotMatch(
      readFileSync(filePath, 'utf8'),
      /sslError|handleConfirm|ignoreSsl/i,
      `SSL bypass marker in harmony/${normalizedProjectPath(filePath)}`,
    );
  }
});

test('HarmonyOS entry ability loads the ArkWeb shell page', () => {
  const entryAbility = readFileSync(
    join(
      harmonyRoot,
      'entry/src/main/ets/entryability/EntryAbility.ets',
    ),
    'utf8',
  );

  assert.match(
    entryAbility,
    /windowStage\.loadContent\(\s*'pages\/Index'/,
  );
  assert.match(entryAbility, /class EntryAbility extends UIAbility/);
  assert.doesNotMatch(entryAbility, /requestPermissionsFromUser/);
});

test('HarmonyOS navigation state preserves failures through page end', () => {
  const navigationState = readFileSync(
    join(
      harmonyRoot,
      'entry/src/main/ets/state/NavigationState.ets',
    ),
    'utf8',
  );
  const executableNavigationState = navigationState
    .replace(
      /export interface NavigationState \{[\s\S]*?\}\n/,
      '',
    )
    .replace(/^export /gm, '')
    .replace(/: boolean\b/g, '')
    .replace(/: NavigationState\b/g, '');
  const {
    navigationStarted,
    navigationFailed,
    navigationEnded,
  } = new Function(
    `"use strict";
${executableNavigationState}
return { navigationStarted, navigationFailed, navigationEnded };`,
  )();

  let state = navigationStarted();
  assert.deepEqual(state, { loading: true, failed: false });

  state = navigationFailed();
  assert.deepEqual(state, { loading: false, failed: true });

  state = navigationEnded(state.failed);
  assert.deepEqual(
    state,
    { loading: false, failed: true },
    'page end must not erase a failure from the current navigation',
  );

  state = navigationStarted();
  state = navigationEnded(state.failed);
  assert.deepEqual(state, { loading: false, failed: false });
});

test('HarmonyOS ArkWeb shell enforces navigation and failure behavior', () => {
  const indexPage = readFileSync(
    join(harmonyRoot, 'entry/src/main/ets/pages/Index.ets'),
    'utf8',
  );

  assert.match(
    indexPage,
    /new webview\.WebviewController\(\)/,
  );
  assert.match(indexPage, /Web\(\s*\{\s*src:\s*APP_URL,\s*controller:/s);
  assert.match(indexPage, /\.javaScriptAccess\(\s*true\s*\)/);
  assert.match(indexPage, /\.domStorageAccess\(\s*true\s*\)/);
  assert.match(indexPage, /\.fileAccess\(\s*false\s*\)/);
  assert.match(indexPage, /\.mixedMode\(\s*MixedMode\.None\s*\)/);
  assert.match(indexPage, /\.onPageBegin\(/);
  assert.match(indexPage, /\.onPageEnd\(/);
  assert.match(indexPage, /\.onErrorReceive\(/);
  assert.match(
    indexPage,
    /retry\(\)[\s\S]*controller\.loadUrl\(\s*APP_URL\s*\)/,
  );
  assert.match(
    indexPage,
    /onBackPress\(\)[\s\S]*accessBackward\(\)[\s\S]*backward\(\)/,
  );
  assert.match(indexPage, /isTrustedAppUrl\(/);
  assert.match(indexPage, /isExternalHttpsUrl\(/);
  assert.match(indexPage, /\.startAbility\(/);
  assert.match(
    indexPage,
    /action:\s*'ohos\.want\.action\.viewData'/,
  );
  assert.match(
    indexPage,
    /entities:\s*\[\s*'entity\.system\.browsable',?\s*\]/,
  );
  assert.match(indexPage, /uri:\s*url/);
  const openExternalBody = /private openExternal\(url: string\): void \{([\s\S]*?)\n  \}\n\n  onBackPress/
    .exec(indexPage)?.[1];
  assert.ok(openExternalBody, 'openExternal method must remain inspectable');
  assert.match(
    openExternalBody,
    /if \(!isExternalHttpsUrl\(url\)\) \{\s*return;\s*\}/,
  );
  const rejectedUrlBranch =
    /if \(!isExternalHttpsUrl\(url\)\) \{([\s\S]*?)\}/
      .exec(openExternalBody)?.[1] ?? '';
  assert.doesNotMatch(
    rejectedUrlBranch,
    /navigationFailed|failed\s*=\s*true/,
    'rejected dangerous protocols must not replace the current page',
  );
  assert.match(
    indexPage,
    /\.onPageBegin\([\s\S]*navigationStarted\(\)/,
  );
  assert.match(
    indexPage,
    /\.onPageEnd\([\s\S]*navigationEnded\(this\.failed\)/,
  );
  assert.match(
    indexPage,
    /\.onErrorReceive\([\s\S]*event\?\.request\.isMainFrame\(\)[\s\S]*navigationFailed\(\)/,
  );
  assert.match(indexPage, /\.onHttpErrorReceive\(/);
  assert.match(
    indexPage,
    /\.onHttpErrorReceive\(\(event\): void => \{[\s\S]*event\?\.request\.isMainFrame\(\)[\s\S]*event\.response\.getResponseCode\(\)\s*>=\s*400[\s\S]*navigationFailed\(\)/,
  );
  assert.match(indexPage, /\.onOverrideUrlLoading\(/);
  assert.match(
    indexPage,
    /\.onOverrideUrlLoading\(\(event\): boolean => \{[\s\S]*const url: string = event\.getRequestUrl\(\);[\s\S]*isTrustedAppUrl\(url\)[\s\S]*isExternalHttpsUrl\(url\)[\s\S]*this\.openExternal\(url\)/,
  );
  assert.doesNotMatch(indexPage, /event\.request\.getRequestUrl\(\)/);
  assert.match(indexPage, /LoadingProgress\(\)/);
  assert.match(indexPage, /\$r\('app\.string\.loading_message'\)/);
  assert.match(indexPage, /\$r\('app\.string\.error_title'\)/);
  assert.match(indexPage, /\$r\('app\.string\.retry'\)/);
  assert.doesNotMatch(indexPage, /javaScriptProxy|http:\/\//i);
});
