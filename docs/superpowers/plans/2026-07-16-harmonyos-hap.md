# Weather Pro HarmonyOS 6 HAP 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 `hap` 分支新增可由 DevEco Studio 6 打开、自动签名并构建为 HarmonyOS 6 Debug HAP 的 ArkWeb 在线壳。

**架构：** `harmony/` 是独立 Stage 模型工程，使用 API 20 和单一 `entry` HAP 模块。ArkWeb 只在应用内加载 `https://43.129.249.56/` 同源页面，其他 HTTPS 链接交给系统浏览器，错误、重试和返回历史由 ArkTS 壳处理；现有 React/Express 业务不复制。

**技术栈：** HarmonyOS 6 API 20、ArkTS、ArkUI、ArkWeb、Hvigor、Node.js `node:test` 静态契约测试。

---

## 文件结构

新增或修改文件及职责：

- 修改：`.gitignore` — 忽略 DevEco、Hvigor、HAP 输出和签名材料。
- 修改：`package.json` — 增加 `test:harmony` 静态验证命令。
- 创建：`harmony/build-profile.json5` — 应用产品、API 20 和模块声明，不包含签名材料。
- 创建：`harmony/hvigorfile.ts` — 根工程 Hvigor 应用任务。
- 创建：`harmony/oh-package.json5` — HarmonyOS 工程元数据和 Hvigor 插件版本。
- 创建：`harmony/hvigor/hvigor-config.json5` — Hvigor 运行配置。
- 创建：`harmony/AppScope/app.json5` — Bundle、版本和应用资源。
- 创建：`harmony/AppScope/resources/base/element/string.json` — 应用名称。
- 创建：`harmony/AppScope/resources/base/media/app_icon.svg` — 测试版应用图标。
- 创建：`harmony/entry/build-profile.json5` — `entry` HAP 模块构建配置。
- 创建：`harmony/entry/hvigorfile.ts` — HAP 模块任务。
- 创建：`harmony/entry/oh-package.json5` — 模块包元数据。
- 创建：`harmony/entry/obfuscation-rules.txt` — Release 混淆入口。
- 创建：`harmony/entry/src/main/module.json5` — Stage Ability、Phone、网络权限和入口声明。
- 创建：`harmony/entry/src/main/ets/entryability/EntryAbility.ets` — UIAbility 生命周期和窗口加载。
- 创建：`harmony/entry/src/main/ets/config/AppConfig.ets` — 唯一线上 URL 和导航白名单。
- 创建：`harmony/entry/src/main/ets/pages/Index.ets` — ArkWeb、加载状态、错误重试、外链与返回。
- 创建：`harmony/entry/src/main/resources/base/element/color.json` — 壳层颜色。
- 创建：`harmony/entry/src/main/resources/base/element/string.json` — Ability 与错误文案。
- 创建：`harmony/entry/src/main/resources/base/profile/main_pages.json` — 页面路由。
- 创建：`harmony/entry/src/main/resources/base/media/app_icon.svg` — Ability 图标。
- 创建：`harmony/tests/project.test.mjs` — Linux 可运行的工程结构与安全契约测试。
- 创建：`harmony/README.md` — DevEco Sync、自动签名、构建、安装和故障排查。

### 任务 1：建立工程结构契约

**文件：**
- 创建：`harmony/tests/project.test.mjs`
- 修改：`package.json`

- [ ] **步骤 1：编写失败的工程结构测试**

创建 `harmony/tests/project.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const harmonyRoot = path.resolve("harmony");

function read(relativePath) {
  return fs.readFileSync(path.join(harmonyRoot, relativePath), "utf8");
}

test("HarmonyOS project declares an API 20 Stage HAP without signing material", () => {
  const required = [
    "build-profile.json5",
    "hvigorfile.ts",
    "oh-package.json5",
    "hvigor/hvigor-config.json5",
    "AppScope/app.json5",
    "entry/build-profile.json5",
    "entry/hvigorfile.ts",
    "entry/oh-package.json5",
    "entry/src/main/module.json5"
  ];

  for (const relativePath of required) {
    assert.equal(fs.existsSync(path.join(harmonyRoot, relativePath)), true, `${relativePath} is required`);
  }

  const rootProfile = read("build-profile.json5");
  assert.match(rootProfile, /"targetSdkVersion":\s*"6\.0\.0\(20\)"/);
  assert.match(rootProfile, /"compatibleSdkVersion":\s*"6\.0\.0\(20\)"/);
  assert.match(rootProfile, /"runtimeOS":\s*"HarmonyOS"/);
  assert.doesNotMatch(rootProfile, /storeFile|storePassword|keyPassword|certpath|profile":\s*"[A-Za-z]:/);

  const module = read("entry/src/main/module.json5");
  assert.match(module, /"type":\s*"entry"/);
  assert.match(module, /"deviceTypes":\s*\[\s*"phone"\s*\]/);
  assert.match(module, /"name":\s*"ohos\.permission\.INTERNET"/);
});
```

- [ ] **步骤 2：增加测试命令**

在 `package.json` 的 `scripts` 中加入：

```json
"test:harmony": "node --test harmony/tests/*.test.mjs"
```

- [ ] **步骤 3：运行测试确认失败**

运行：

```bash
npm run test:harmony
```

预期：FAIL，首个缺失文件为 `harmony/build-profile.json5`。

### 任务 2：创建 HarmonyOS API 20 工程骨架

**文件：**
- 创建：`harmony/build-profile.json5`
- 创建：`harmony/hvigorfile.ts`
- 创建：`harmony/oh-package.json5`
- 创建：`harmony/hvigor/hvigor-config.json5`
- 创建：`harmony/AppScope/app.json5`
- 创建：`harmony/AppScope/resources/base/element/string.json`
- 创建：`harmony/AppScope/resources/base/media/app_icon.svg`
- 创建：`harmony/entry/build-profile.json5`
- 创建：`harmony/entry/hvigorfile.ts`
- 创建：`harmony/entry/oh-package.json5`
- 创建：`harmony/entry/obfuscation-rules.txt`
- 创建：`harmony/entry/src/main/module.json5`
- 创建：`harmony/entry/src/main/resources/base/element/color.json`
- 创建：`harmony/entry/src/main/resources/base/element/string.json`
- 创建：`harmony/entry/src/main/resources/base/profile/main_pages.json`
- 创建：`harmony/entry/src/main/resources/base/media/app_icon.svg`

- [ ] **步骤 1：创建根构建配置**

`harmony/build-profile.json5`：

```json5
{
  "app": {
    "signingConfigs": [],
    "products": [
      {
        "name": "default",
        "signingConfig": "default",
        "targetSdkVersion": "6.0.0(20)",
        "compatibleSdkVersion": "6.0.0(20)",
        "runtimeOS": "HarmonyOS"
      }
    ],
    "buildModeSet": [
      { "name": "debug" },
      { "name": "release" }
    ]
  },
  "modules": [
    {
      "name": "entry",
      "srcPath": "./entry",
      "targets": [
        {
          "name": "default",
          "applyToProducts": ["default"]
        }
      ]
    }
  ]
}
```

`harmony/hvigorfile.ts`：

```ts
import { appTasks } from '@ohos/hvigor-ohos-plugin';

export default {
  system: appTasks,
  plugins: []
};
```

`harmony/oh-package.json5`：

```json5
{
  "modelVersion": "5.0.5",
  "description": "Weather Pro HarmonyOS shell",
  "dependencies": {},
  "devDependencies": {
    "@ohos/hvigor-ohos-plugin": "6.0.0"
  }
}
```

`harmony/hvigor/hvigor-config.json5`：

```json5
{
  "modelVersion": "5.0.5",
  "dependencies": {
    "@ohos/hvigor": "6.0.0"
  },
  "execution": {
    "analyze": "normal",
    "daemon": true,
    "incremental": true,
    "parallel": true,
    "typeCheck": true
  },
  "logging": {
    "level": "info"
  }
}
```

- [ ] **步骤 2：创建应用范围配置**

`harmony/AppScope/app.json5`：

```json5
{
  "app": {
    "bundleName": "com.xuehaoweng.weatherhelp",
    "vendor": "xuehaoweng",
    "versionCode": 1000000,
    "versionName": "0.1.0",
    "icon": "$media:app_icon",
    "label": "$string:app_name"
  }
}
```

`harmony/AppScope/resources/base/element/string.json`：

```json
{
  "string": [
    {
      "name": "app_name",
      "value": "Weather Pro"
    }
  ]
}
```

`harmony/AppScope/resources/base/media/app_icon.svg` 与模块图标使用同一内容：

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#244f46"/>
  <circle cx="190" cy="190" r="76" fill="#f3c969"/>
  <path d="M132 326c0-57 46-103 103-103 38 0 72 21 90 53 11-5 24-8 37-8 48 0 87 39 87 87s-39 87-87 87H151c-49 0-88-39-88-88 0-42 29-77 69-86z" fill="#f7fbf8"/>
  <path d="M205 385l-22 45M278 385l-22 45M351 385l-22 45" stroke="#7ec8e3" stroke-width="18" stroke-linecap="round"/>
</svg>
```

- [ ] **步骤 3：创建 HAP 模块配置**

`harmony/entry/hvigorfile.ts`：

```ts
import { hapTasks } from '@ohos/hvigor-ohos-plugin';

export default {
  system: hapTasks,
  plugins: []
};
```

`harmony/entry/oh-package.json5`：

```json5
{
  "name": "entry",
  "version": "0.1.0",
  "description": "Weather Pro HarmonyOS entry module",
  "main": "",
  "author": "xuehaoweng",
  "license": "MIT",
  "dependencies": {}
}
```

`harmony/entry/build-profile.json5`：

```json5
{
  "apiType": "stageMode",
  "buildOption": {},
  "buildOptionSet": [
    {
      "name": "release",
      "arkOptions": {
        "obfuscation": {
          "ruleOptions": {
            "enable": false,
            "files": ["./obfuscation-rules.txt"],
            "consumerFiles": []
          }
        }
      }
    }
  ],
  "targets": [
    {
      "name": "default"
    }
  ]
}
```

`harmony/entry/obfuscation-rules.txt`：

```text
# Release obfuscation is intentionally disabled for the install-test HAP.
```

- [ ] **步骤 4：声明 Ability、Phone 和网络权限**

`harmony/entry/src/main/module.json5`：

```json5
{
  "module": {
    "name": "entry",
    "type": "entry",
    "description": "$string:module_desc",
    "mainElement": "EntryAbility",
    "deviceTypes": ["phone"],
    "deliveryWithInstall": true,
    "installationFree": false,
    "pages": "$profile:main_pages",
    "abilities": [
      {
        "name": "EntryAbility",
        "srcEntry": "./ets/entryability/EntryAbility.ets",
        "description": "$string:EntryAbility_desc",
        "icon": "$media:app_icon",
        "label": "$string:EntryAbility_label",
        "startWindowIcon": "$media:app_icon",
        "startWindowBackground": "$color:start_window_background",
        "exported": true,
        "skills": [
          {
            "entities": ["entity.system.home"],
            "actions": ["ohos.want.action.home"]
          }
        ]
      }
    ],
    "requestPermissions": [
      {
        "name": "ohos.permission.INTERNET"
      }
    ]
  }
}
```

`harmony/entry/src/main/resources/base/profile/main_pages.json`：

```json
{
  "src": [
    "pages/Index"
  ]
}
```

`harmony/entry/src/main/resources/base/element/string.json`：

```json
{
  "string": [
    { "name": "module_desc", "value": "Weather Pro HarmonyOS 应用" },
    { "name": "EntryAbility_desc", "value": "Weather Pro 启动入口" },
    { "name": "EntryAbility_label", "value": "Weather Pro" },
    { "name": "loading_message", "value": "正在连接天气服务…" },
    { "name": "error_title", "value": "天气服务暂时无法连接" },
    { "name": "error_message", "value": "请检查网络后重试。" },
    { "name": "retry", "value": "重新加载" }
  ]
}
```

`harmony/entry/src/main/resources/base/element/color.json`：

```json
{
  "color": [
    { "name": "start_window_background", "value": "#F4F7F5" },
    { "name": "shell_background", "value": "#F4F7F5" },
    { "name": "brand", "value": "#244F46" },
    { "name": "muted", "value": "#64756F" },
    { "name": "surface", "value": "#FFFFFF" }
  ]
}
```

复制步骤 2 的 SVG 到 `harmony/entry/src/main/resources/base/media/app_icon.svg`。

- [ ] **步骤 5：运行结构测试**

运行：

```bash
npm run test:harmony
```

预期：PASS，1 个测试通过。

- [ ] **步骤 6：提交工程骨架**

```bash
git add package.json harmony
git commit -m "feat: scaffold HarmonyOS 6 HAP project"
```

### 任务 3：实现 URL 白名单与安全导航

**文件：**
- 修改：`harmony/tests/project.test.mjs`
- 创建：`harmony/entry/src/main/ets/config/AppConfig.ets`

- [ ] **步骤 1：追加失败的 URL 安全测试**

在 `harmony/tests/project.test.mjs` 追加：

```js
test("ArkWeb URL policy allows only the Weather Pro HTTPS origin", () => {
  const config = read("entry/src/main/ets/config/AppConfig.ets");

  assert.match(config, /APP_URL\s*=\s*'https:\/\/43\.129\.249\.56\/'/);
  assert.match(config, /url === APP_URL \|\| url\.startsWith\(APP_URL\)/);
  assert.match(config, /url\.startsWith\('https:\/\/'\)/);
  assert.doesNotMatch(config, /http:\/\/43\.129\.249\.56/);
  assert.doesNotMatch(config, /sslError|handleConfirm|ignoreSsl/i);
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
npm run test:harmony
```

预期：FAIL，缺少 `entry/src/main/ets/config/AppConfig.ets`。

- [ ] **步骤 3：实现最小 URL 策略**

创建 `harmony/entry/src/main/ets/config/AppConfig.ets`：

```ts
export const APP_URL: string = 'https://43.129.249.56/';

export function isTrustedAppUrl(url: string): boolean {
  return url === APP_URL || url.startsWith(APP_URL);
}

export function isExternalHttpsUrl(url: string): boolean {
  return url.startsWith('https://') && !isTrustedAppUrl(url);
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npm run test:harmony
```

预期：PASS，2 个测试通过。

- [ ] **步骤 5：提交 URL 策略**

```bash
git add harmony/tests/project.test.mjs harmony/entry/src/main/ets/config/AppConfig.ets
git commit -m "feat: restrict HarmonyOS web navigation"
```

### 任务 4：实现 EntryAbility 与 ArkWeb 壳

**文件：**
- 修改：`harmony/tests/project.test.mjs`
- 创建：`harmony/entry/src/main/ets/entryability/EntryAbility.ets`
- 创建：`harmony/entry/src/main/ets/pages/Index.ets`

- [ ] **步骤 1：追加失败的 ArkWeb 行为测试**

在 `harmony/tests/project.test.mjs` 追加：

```js
test("ArkWeb shell exposes loading, retry, back navigation, and safe external links", () => {
  const page = read("entry/src/main/ets/pages/Index.ets");
  const ability = read("entry/src/main/ets/entryability/EntryAbility.ets");

  assert.match(ability, /windowStage\.loadContent\('pages\/Index'/);
  assert.match(page, /new webview\.WebviewController\(\)/);
  assert.match(page, /Web\(\{ src: APP_URL, controller: this\.controller \}\)/);
  assert.match(page, /\.javaScriptAccess\(true\)/);
  assert.match(page, /\.domStorageAccess\(true\)/);
  assert.match(page, /\.fileAccess\(false\)/);
  assert.match(page, /\.mixedMode\(MixedMode\.None\)/);
  assert.match(page, /\.onPageBegin\(/);
  assert.match(page, /\.onPageEnd\(/);
  assert.match(page, /\.onErrorReceive\(/);
  assert.match(page, /this\.controller\.loadUrl\(APP_URL\)/);
  assert.match(page, /this\.controller\.accessBackward\(\)/);
  assert.match(page, /isTrustedAppUrl\(url\)/);
  assert.match(page, /isExternalHttpsUrl\(url\)/);
  assert.doesNotMatch(page, /onSslErrorEvent|handleConfirm|ignoreSsl/i);
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
npm run test:harmony
```

预期：FAIL，缺少 `EntryAbility.ets` 或 `Index.ets`。

- [ ] **步骤 3：实现 EntryAbility**

创建 `harmony/entry/src/main/ets/entryability/EntryAbility.ets`：

```ts
import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

const DOMAIN: number = 0x0000;

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, 'WeatherPro', 'EntryAbility created');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code) {
        hilog.error(DOMAIN, 'WeatherPro', `Failed to load Index: ${error.code}`);
      }
    });
  }
}
```

- [ ] **步骤 4：实现 ArkWeb 页面**

创建 `harmony/entry/src/main/ets/pages/Index.ets`：

```ts
import { common, Want } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { APP_URL, isExternalHttpsUrl, isTrustedAppUrl } from '../config/AppConfig';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private loading: boolean = true;
  @State private failed: boolean = false;

  private retry(): void {
    this.failed = false;
    this.loading = true;
    this.controller.loadUrl(APP_URL);
  }

  private openExternal(url: string): void {
    if (!isExternalHttpsUrl(url)) {
      return;
    }
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const want: Want = {
      action: 'ohos.want.action.viewData',
      uri: url
    };
    context.startAbility(want).catch(() => {
      this.failed = true;
    });
  }

  onBackPress(): boolean {
    if (this.controller.accessBackward()) {
      this.controller.backward();
      return true;
    }
    return false;
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Web({ src: APP_URL, controller: this.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .mixedMode(MixedMode.None)
        .onPageBegin(() => {
          this.loading = true;
          this.failed = false;
        })
        .onPageEnd(() => {
          this.loading = false;
        })
        .onErrorReceive(() => {
          this.loading = false;
          this.failed = true;
        })
        .onOverrideUrlLoading((event) => {
          const url: string = event.getRequest().getRequestUrl();
          if (isTrustedAppUrl(url)) {
            return false;
          }
          this.openExternal(url);
          return true;
        });

      if (this.loading && !this.failed) {
        Column({ space: 16 }) {
          LoadingProgress()
            .width(44)
            .height(44)
            .color($r('app.color.brand'));
          Text($r('app.string.loading_message'))
            .fontSize(15)
            .fontColor($r('app.color.muted'));
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor($r('app.color.shell_background'));
      }

      if (this.failed) {
        Column({ space: 12 }) {
          Text('☁️')
            .fontSize(48);
          Text($r('app.string.error_title'))
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.brand'));
          Text($r('app.string.error_message'))
            .fontSize(14)
            .fontColor($r('app.color.muted'));
          Button($r('app.string.retry'))
            .margin({ top: 12 })
            .backgroundColor($r('app.color.brand'))
            .onClick(() => this.retry());
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor($r('app.color.shell_background'));
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.shell_background'));
  }
}
```

- [ ] **步骤 5：运行静态契约测试**

运行：

```bash
npm run test:harmony
```

预期：PASS，3 个测试通过。

- [ ] **步骤 6：提交 ArkWeb 壳**

```bash
git add harmony/tests/project.test.mjs harmony/entry/src/main/ets
git commit -m "feat: add HarmonyOS ArkWeb shell"
```

### 任务 5：保护签名材料并编写 DevEco 使用说明

**文件：**
- 修改：`.gitignore`
- 修改：`harmony/tests/project.test.mjs`
- 创建：`harmony/README.md`

- [ ] **步骤 1：追加失败的仓库安全测试**

在 `harmony/tests/project.test.mjs` 追加：

```js
test("repository ignores HarmonyOS build and signing artifacts", () => {
  const gitignore = fs.readFileSync(path.resolve(".gitignore"), "utf8");
  const readme = read("README.md");

  for (const pattern of [
    "harmony/.hvigor/",
    "harmony/**/build/",
    "harmony/**/*.hap",
    "harmony/**/*.p12",
    "harmony/**/*.p7b",
    "harmony/**/*.cer",
    "harmony/**/*.profile"
  ]) {
    assert.match(gitignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(readme, /DevEco Studio 6/);
  assert.match(readme, /自动签名/);
  assert.match(readme, /HarmonyOS 6/);
  assert.match(readme, /https:\/\/43\.129\.249\.56\//);
  assert.match(readme, /不要提交.*p12|不得提交.*p12/);
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
npm run test:harmony
```

预期：FAIL，`.gitignore` 缺少 HarmonyOS 规则或 `harmony/README.md` 不存在。

- [ ] **步骤 3：增加忽略规则**

在 `.gitignore` 追加：

```gitignore

# HarmonyOS / DevEco Studio
harmony/.hvigor/
harmony/.idea/
harmony/local.properties
harmony/oh_modules/
harmony/**/build/
harmony/**/*.hap
harmony/**/*.app
harmony/**/*.p12
harmony/**/*.p7b
harmony/**/*.cer
harmony/**/*.profile
```

- [ ] **步骤 4：创建 DevEco README**

创建 `harmony/README.md`，包含以下完整流程：

```markdown
# Weather Pro for HarmonyOS 6

该目录是 Weather Pro 的 HarmonyOS 6 API 20 安装测试工程，使用 ArkWeb 加载：

`https://43.129.249.56/`

## 环境

- DevEco Studio 6
- HarmonyOS 6 SDK / API 20
- 已实名认证的华为开发者账号
- HarmonyOS 6 真机，并已开启开发者模式

## 打开与同步

1. 在 DevEco Studio 中选择 Open Project。
2. 选择仓库内的 `harmony` 目录。
3. 等待 SDK、Hvigor 和 OHPM Sync 完成。
4. 如果 IDE 提示升级 `modelVersion` 或 Hvigor，只接受 DevEco Studio 针对已安装 API 20 SDK 生成的兼容改动，不要加入签名文件。

## 自动签名

1. 打开 File > Project Structure > Signing Configs。
2. 登录华为开发者账号。
3. 为 `entry` 的 `default` 产品启用 Automatically generate signature。
4. 选择已连接的 HarmonyOS 6 测试设备。

签名配置只保留在本机。不得提交 `.p12`、`.p7b`、`.cer`、`.profile`、密码或本机绝对路径。

## 构建与安装

1. 执行 Build > Build Hap(s)/APP(s) > Build Hap(s)。
2. Debug HAP 通常生成在 `entry/build/default/outputs/default/`。
3. 连接真机后点击 Run，或使用 DevEco Studio/HDC 安装生成的 HAP。

## 验收

- 应用启动并显示 Weather Pro。
- 城市搜索、场景切换、真实天气和 `/admin` 页面可打开。
- 断网时显示原生错误页，联网后“重新加载”恢复。
- 外部和风天气详情由系统浏览器打开。
- 返回手势优先回退 Web 历史。

## 故障排查

- 白屏：先用手机浏览器打开 `https://43.129.249.56/`，确认网络和证书正常。
- Sync 失败：确认安装 HarmonyOS 6 API 20 SDK，并重新执行 Sync。
- 签名失败：退出后重新登录华为开发者账号，删除本机生成的失效自动签名配置后重新生成。
- 页面部分数据缺失：后台采用渐进加载，上游单项超时会显示部分数据，可稍后刷新。
```

- [ ] **步骤 5：运行测试验证通过**

运行：

```bash
npm run test:harmony
```

预期：PASS，4 个测试通过。

- [ ] **步骤 6：提交安全规则和文档**

```bash
git add .gitignore harmony/README.md harmony/tests/project.test.mjs
git commit -m "docs: explain HarmonyOS signing and install flow"
```

### 任务 6：完成验证与推送

**文件：**
- 修改：`docs/superpowers/plans/2026-07-16-harmonyos-hap.md`

- [ ] **步骤 1：运行 Web 回归测试**

运行：

```bash
npm test
```

预期：15 个测试文件通过，0 个失败。

- [ ] **步骤 2：运行 HarmonyOS 静态契约测试**

运行：

```bash
npm run test:harmony
```

预期：4 个测试通过，0 个失败。

- [ ] **步骤 3：验证 Web 生产构建**

运行：

```bash
npm run build
```

预期：Vite 构建成功并生成 `dist/`。

- [ ] **步骤 4：验证线上 HTTPS**

运行：

```bash
curl -fsSI https://43.129.249.56/
curl -fsS https://43.129.249.56/api/health
```

预期：首页返回 `HTTP/2 200`；健康接口返回 `"mode":"qweather"` 且凭据状态为 `true`。

- [ ] **步骤 5：检查仓库安全和格式**

运行：

```bash
git diff --check
git status --short
git ls-files harmony | rg '\.(p12|p7b|cer|profile|hap|app)$'
```

预期：`git diff --check` 无输出；只显示本计划内变更；签名和产物扫描无输出。

- [ ] **步骤 6：更新计划复选框并提交**

将已完成步骤改为 `[x]`，然后运行：

```bash
git add docs/superpowers/plans/2026-07-16-harmonyos-hap.md
git commit -m "docs: complete HarmonyOS HAP implementation plan"
```

- [ ] **步骤 7：推送隔离分支**

```bash
git push origin hap
```

预期：远端 `hap` 更新，`main` 保持在 `c4aaa43` 或用户之后自行产生的新提交。

- [ ] **步骤 8：DevEco Studio 人工验收**

由开发者在 Windows/macOS 执行：

1. 打开 `harmony/` 并完成 Sync。
2. 登录华为账号并启用自动签名。
3. 构建 Debug HAP。
4. 安装到 HarmonyOS 6 真机。
5. 按 `harmony/README.md` 完成九项交互验收。

若 DevEco 自动升级工程元数据，只提交与 API 20/Hvigor 兼容相关的最小变更，继续排除所有签名材料。
