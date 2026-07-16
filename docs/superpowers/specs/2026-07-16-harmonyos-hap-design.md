# Weather Pro HarmonyOS 6 HAP 设计

## 目标

在不修改 `main` 分支现有 Web 业务逻辑的前提下，为 Weather Pro 提供一个可在 HarmonyOS 6 真机安装测试的 HAP。第一版使用 ArkTS Stage 模型与 ArkWeb 加载线上 Weather Pro，验证安装、启动、导航、HTTPS 和基本交互链路。

## 成功标准

- 工程位于独立 `hap` 分支的 `harmony/` 目录。
- 使用 HarmonyOS 6 API 20、Stage 模型和 ArkTS。
- DevEco Studio 能识别、同步和构建工程。
- 登录华为开发者账号并启用自动签名后，可生成真机调试 HAP。
- 应用启动后加载 `https://43.129.249.56/`。
- 页面加载中、加载成功、断网失败和重试均有明确状态。
- 系统返回手势优先返回 Web 历史；没有历史时退出当前页面。
- 只允许应用内加载受信任的 Weather Pro HTTPS 地址，外部链接交给系统浏览器。
- 不提交签名证书、私钥、调试 Profile、和风天气凭据或管理员密码。

## 方案选择

第一版采用 ArkWeb 在线壳，不内置 React 构建产物，也不重写 ArkUI 业务页面。

选择该方案的原因：

- 现有场景建议、渐进加载、定位、收藏和后台逻辑继续保持单一实现。
- Web 修复上线后 HAP 无需重新发版即可获得更新。
- 第一阶段重点是验证鸿蒙安装和运行链路，而不是复制业务逻辑。

代价是应用依赖网络和线上服务。离线资源包、原生定位、原生推送、桌面卡片和元服务不属于第一阶段。

## 工程结构

```text
harmony/
├── AppScope/
│   ├── app.json5
│   └── resources/
├── entry/
│   ├── build-profile.json5
│   └── src/main/
│       ├── module.json5
│       ├── ets/
│       │   ├── entryability/EntryAbility.ets
│       │   ├── pages/Index.ets
│       │   └── config/AppConfig.ets
│       └── resources/
├── build-profile.json5
├── hvigorfile.ts
├── oh-package.json5
└── README.md
```

应用参数：

- 应用名称：`Weather Pro`
- Bundle Name：`com.xuehaoweng.weatherhelp`
- Module：`entry`
- Compile/Target SDK：HarmonyOS 6 API 20
- 设备类型：Phone

## 页面与状态

`Index.ets` 只负责原生壳层：

1. 顶部安全区域和应用背景。
2. ArkWeb `Web` 组件。
3. 首次加载的轻量进度状态。
4. 加载失败页面，展示错误说明和“重新加载”按钮。
5. Web 页面成功显示后隐藏原生加载层。

错误页不显示内部堆栈、证书详情或服务器凭据。网络恢复后由用户主动重试，避免无限刷新。

## URL 与导航策略

线上入口集中定义在 `AppConfig.ets`：

```ts
export const APP_URL = 'https://43.129.249.56/';
```

规则：

- 仅 `https://43.129.249.56/` 及其同源路径在 ArkWeb 内加载。
- `http:`、`file:`、`data:`、自定义 Scheme 和其他未知协议不得在 ArkWeb 内加载。
- 和风天气详情等外部 `https:` 链接交给系统浏览器。
- 不提供运行时任意 URL 输入框，避免将应用变成通用浏览器。
- 不忽略或绕过 SSL/TLS 校验错误。

## ArkWeb 配置

第一版仅开启页面运行所需能力：

- JavaScript：开启。
- DOM Storage：开启，用于收藏地点、提醒设置和匿名安装标识。
- 网络访问：仅通过系统网络权限。
- 文件访问：关闭。
- 混合内容：禁止 HTTPS 页面加载 HTTP 子资源。
- 调试开关：只允许调试构建使用，发布构建关闭。

ArkWeb 不注入管理员凭据、和风天气密钥或任意 JavaScript Bridge。

## 生命周期与返回

- `EntryAbility` 创建窗口后加载 `Index` 页面。
- 应用进入后台时保留 Web 状态，不主动刷新。
- 应用重新进入前台时沿用现有 Web 页面的可见性事件和提醒检查。
- 返回操作先调用 ArkWeb 历史回退；无法回退时交给系统退出页面。

## HTTPS 与服务端

线上服务地址为：

```text
https://43.129.249.56/
```

服务器当前使用：

- CentOS Stream 9
- Nginx HTTPS 反向代理
- Node.js 24 LTS
- Let’s Encrypt 公网 IPv4 短期证书
- Lego 自动签发
- systemd timer 每天检查续签，成功后自动重载 Nginx

HAP 不信任自签名证书，也不实现证书固定。IP 证书约 6 天有效，因此服务器续签 timer 是安装测试持续可用的前置条件。

## 签名与敏感文件

- 仓库不包含签名配置值。
- 开发者在 DevEco Studio 登录华为账号后使用自动签名。
- `.p12`、`.cer`、`.p7b`、`.profile`、本机 SDK 路径和 IDE 用户配置必须被忽略。
- README 记录 DevEco Studio 自动签名和真机安装步骤，但不记录账号信息。

## 测试与验收

静态检查：

- JSON5、ArkTS 和工程文件结构完整。
- URL 常量只允许 HTTPS。
- 模块只声明必要权限。
- Git 不跟踪签名材料。

DevEco Studio 验收：

1. 使用 HarmonyOS 6 SDK 打开 `harmony/`。
2. 完成 Sync。
3. 登录华为开发者账号并启用自动签名。
4. 构建 Debug HAP。
5. 安装到 HarmonyOS 6 真机。
6. 验证启动、真实天气、城市搜索、场景切换和后台登录页面。
7. 关闭网络后验证错误页，再恢复网络并重试。
8. 打开外部天气详情，确认交给系统浏览器。
9. 验证返回手势先返回 Web 历史。

当前 Linux 工作区没有 DevEco Studio 和 HarmonyOS SDK，因此这里负责工程生成、静态验证和 Web/HTTPS 联调；最终 HAP 编译、自动签名和真机安装由开发者在 DevEco Studio 中完成。

## 回滚

- HAP 工程全部位于 `hap` 分支和 `harmony/` 目录，删除分支即可撤销，不影响 `main`。
- 服务器发布采用版本目录和 `/opt/weather-pro/current` 软链接，可切换回前一版本。
- Nginx 配置修改前保留备份；配置检查失败时不得 reload。

## 非目标

- ArkUI 原生重写天气首页。
- 原生 Location Kit。
- Push Kit、后台雨前推送和通知点击深链。
- 桌面服务卡片、实况窗和元服务。
- AppGallery 正式上架材料与隐私审核。
- Android/iOS 打包。
