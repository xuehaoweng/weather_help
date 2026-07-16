# Weather Pro for HarmonyOS

这是 Weather Pro 的 HarmonyOS 6 测试版 HAP 工程。应用使用 ArkWeb 加载线上站点：

<https://43.129.249.56/>

当前版本的目标是复用现有 React/Express 产品，快速完成鸿蒙真机安装和交互验收。天气业务逻辑仍由线上服务提供，HAP 不内置天气 API 密钥。

## 准备环境

- DevEco Studio 6
- HarmonyOS 6 SDK，API 20
- 已完成实名认证的华为开发者账号
- HarmonyOS 6 真机，并已开启开发者模式和 USB 调试
- 能访问线上地址的网络

不要在仓库中保存 SDK 本机路径、开发者账号信息或签名密码。

## 导入并同步工程

1. 启动 DevEco Studio 6，选择 **Open**。
2. 选择仓库中的 `harmony` 目录，而不是仓库根目录。
3. 等待 DevEco Studio 完成项目识别和 **Sync**。
4. 如果提示缺少 SDK，在 SDK Manager 中安装 HarmonyOS 6 API 20 后重新 Sync。
5. 确认运行配置选择 `entry` 模块、`default` product 和 Debug 构建模式。

首次同步需要下载 Hvigor 依赖，代理或网络受限时可能耗时较长。

## 配置自动签名

1. 在 DevEco Studio 登录华为开发者账号。
2. 打开 **File > Project Structure > Project > Signing Configs**。
3. 为 `default` product 选择自动签名，按界面提示绑定调试设备并生成调试证书。
4. 应用配置后确认 `entry` 模块不再显示签名错误。

签名材料只允许保存在开发机。不得提交 `.p12`、`.p7b`、`.cer`、`.profile`、密钥、证书密码或自动生成的 signing config。仓库的 `build-profile.json5` 故意不包含证书路径和密码；`.gitignore` 也会排除常见签名产物。

提交代码前可运行：

```bash
git status --short
find harmony -type f \( -name '*.hap' -o -name '*.app' \) -print0 \
  | xargs -0 -r git check-ignore --no-index
git ls-files \
  'harmony/**/*.p12' 'harmony/**/*.p7b' 'harmony/**/*.cer' \
  'harmony/**/*.profile' 'harmony/**/*.pem' 'harmony/**/*.key' \
  'harmony/**/*.jks' 'harmony/**/*.keystore'
```

`.hap` 和 `.app` 是正常构建产物，可以留在本地；第二条命令必须逐项输出找到的构建产物，确认它们均被 Git 忽略。第三条命令必须没有输出，确认签名私钥和证书材料未被 Git 跟踪。

## 构建和安装

### DevEco Studio

1. 选择 **Build > Build Hap(s)/APP(s) > Build Hap(s)**。
2. 构建成功后，在 `harmony/entry/build/default/outputs/default/` 下查找生成的 Debug HAP；DevEco Studio 的 Build 窗口也会显示实际输出路径。
3. 使用 USB 连接已开启开发者模式的 HarmonyOS 6 真机，在设备选择器中选中手机。
4. 点击 **Run 'entry'**。DevEco Studio 会使用自动签名后的 HAP 完成真机安装并启动应用。

### HDC 安装

如果需要安装已经由 DevEco Studio 签名的 HAP，可在配置好 HarmonyOS SDK 命令行工具后执行：

```bash
hdc list targets
hdc install path/to/entry-default-signed.hap
```

未签名、签名账号与设备不匹配或已过期的 HAP 不能安装。请在 DevEco Studio 中重新自动签名和构建，不要把签名产物加入 Git。

## 真机验收

构建安装后按以下清单验收：

- [ ] 点击图标可启动，首屏加载 <https://43.129.249.56/>。
- [ ] 搜索城市后能展示对应的真实天气数据。
- [ ] 通勤、户外、亲子场景可以切换，建议内容随场景变化。
- [ ] `/admin` 能打开登录页；使用部署环境配置的管理员账号验证登录，仓库不保存账号密码。
- [ ] 关闭网络后出现错误状态，恢复网络并点击重试可以重新加载。
- [ ] 点击站外 HTTPS 链接时交给系统浏览器处理，不在 ArkWeb 内加载。
- [ ] 进入站内子页面后按系统返回键优先返回网页历史；没有网页历史时退出应用页面。
- [ ] 天气详情接口短暂失败时仍可看到渐进加载的基础数据，并显示数据不完整提示。

## 故障排查

### ArkWeb 白屏

- 先用手机浏览器访问 <https://43.129.249.56/>，确认网络、HTTPS 证书和服务正常。
- 检查 DevEco Studio Log 窗口中的 ArkWeb、网络和 Ability 日志。
- 确认 `entry/src/main/module.json5` 包含 `ohos.permission.INTERNET`。
- 若页面曾加载失败，恢复网络后点击应用内重试，不必清除应用数据。

### Sync 或 Hvigor 失败

- 确认使用 DevEco Studio 6，并安装 HarmonyOS 6 SDK API 20。
- 确认打开的是 `harmony` 目录。
- 在 SDK Manager 中修复缺失组件，再执行 **File > Sync and Refresh Project**。
- 检查依赖下载网络；不要提交本机生成的 `local.properties`、`.hvigor` 或 `oh_modules`。

### 自动签名或安装失败

- 确认 DevEco Studio 已登录正确的华为开发者账号，真机已开启开发者模式。
- 在 **Project Structure > Signing Configs** 中重新选择自动签名并绑定当前设备。
- 删除手机上的旧测试包后重新 Run，避免不同签名冲突。
- 检查设备时间是否准确，以及调试证书和 profile 是否过期。
- 不要通过提交 `.p12` 等签名文件来绕过本机配置问题。

### 只有部分天气数据

- 基础天气与详情采用渐进加载，详情接口异常时基础数据仍会先显示。
- 查看页面的数据完整度和更新时间提示，稍后点击刷新或重新搜索。
- 直接访问 `https://43.129.249.56/api/health` 检查服务状态。
- 若健康检查正常但天气详情持续缺失，检查服务端天气供应商配置和日志；这不是 HAP 签名问题。
