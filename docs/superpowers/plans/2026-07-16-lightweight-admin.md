# Weather Pro 轻量管理后台实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 提供密码保护、隐私友好的匿名运营指标和服务健康后台。

**架构：** 浏览器只上报白名单事件和随机安装标识；服务端把安装标识按日哈希并写入单实例 JSON 聚合存储。管理员通过短期 HttpOnly Cookie 访问 `/admin` 的 7/30 天汇总，公开天气流程不依赖统计成功。

**技术栈：** Node.js crypto/fs、Express 4、React 19、Vite 6、JSON 原子持久化

---

## 文件结构

- 创建：`server/analytics-store.js`、`server/analytics-store.test.js`，每日聚合和 30 天保留。
- 创建：`server/admin-auth.js`、`server/admin-auth.test.js`，密码校验、会话和 Cookie。
- 修改：`server/app.js`、`server/app.test.js`、`server/index.js`，统计和管理 API。
- 创建：`src/analytics-client.js`、`src/analytics-client.test.js`，白名单客户端事件。
- 创建：`src/AdminApp.jsx`、`src/admin.css`，登录与指标后台。
- 修改：`src/main.jsx`、`.env.example`、`README.md`、`README.en.md`、`docs/deployment.md`、`SECURITY.md`。

### 任务 1：匿名每日聚合存储

**文件：**
- 创建：`server/analytics-store.test.js`
- 创建：`server/analytics-store.js`

- [ ] **步骤 1：编写失败测试**

覆盖：

```js
await store.record({ type: "page_view", visitorId: "install-a", at: "2026-07-16T10:00:00Z" });
await store.record({ type: "page_view", visitorId: "install-a", at: "2026-07-16T11:00:00Z" });
const overview = await store.overview(7);
assert.equal(overview.totals.pageViews, 2);
assert.equal(overview.totals.activeVisitors, 1);
```

另测场景白名单、提醒计数、错误类别、损坏文件恢复、写入失败降级和 30 天清理。

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test server/analytics-store.test.js`

预期：模块不存在。

- [ ] **步骤 3：实现原子存储**

使用单写入 Promise 队列、临时文件和 `rename`。每日盐由 `ANALYTICS_HASH_SECRET` 和日期通过 HMAC 派生；磁盘只保存每日访客哈希集合。`overview()` 不返回集合。

- [ ] **步骤 4：运行存储测试**

运行：`node --test server/analytics-store.test.js`

预期：全部通过。

- [ ] **步骤 5：提交任务 1**

```bash
git add server/analytics-store.js server/analytics-store.test.js
git commit -m "feat: aggregate privacy-friendly usage metrics"
```

### 任务 2：事件 API 与客户端采集

**文件：**
- 修改：`server/app.js`
- 修改：`server/app.test.js`
- 创建：`src/analytics-client.js`
- 创建：`src/analytics-client.test.js`
- 修改：`src/main.jsx`

- [ ] **步骤 1：编写事件验证测试**

```js
assert.equal((await handlers.analytics({ type: "page_view", visitorId: "a" })).status, 202);
assert.equal((await handlers.analytics({ type: "unknown", visitorId: "a" })).status, 400);
assert.equal((await handlers.analytics({ type: "scene_changed", properties: { mode: "secret" } })).status, 400);
```

- [ ] **步骤 2：实现 `POST /api/analytics/events`**

请求体最大 4KB，只接受规格白名单。禁用统计时返回 `204`。存储异常也返回 `202`，同时记录服务端警告，不影响用户流程。

- [ ] **步骤 3：实现客户端**

`trackEvent(type, properties)` 使用 `navigator.sendBeacon` 或 `fetch(..., { keepalive: true })`，安装 ID 保存在 localStorage。属性在客户端也按白名单过滤。

- [ ] **步骤 4：接入关键事件**

应用成功渲染后发送一次 `page_view`；城市选择、场景切换、提醒启停和通知发送分别上报对应事件，不上报城市名或坐标。

- [ ] **步骤 5：运行测试和构建**

运行：`npm test && npm run build`

预期：全部成功。

- [ ] **步骤 6：提交任务 2**

```bash
git add server/app.js server/app.test.js src/analytics-client.js src/analytics-client.test.js src/main.jsx
git commit -m "feat: collect anonymous product events"
```

### 任务 3：管理员认证和管理 API

**文件：**
- 创建：`server/admin-auth.js`
- 创建：`server/admin-auth.test.js`
- 修改：`server/app.js`
- 修改：`server/app.test.js`
- 修改：`server/index.js`

- [ ] **步骤 1：编写认证测试**

覆盖未配置返回 404、正确密码登录、错误密码 401、五次失败限流、会话 30 分钟失效、注销和 Cookie 的 `HttpOnly; SameSite=Strict`。

- [ ] **步骤 2：实现认证模块**

使用 `crypto.scrypt` 派生并用 `timingSafeEqual` 比较。会话随机 ID 存于内存 Map，记录 `lastSeenAt`。生产 Cookie 增加 `Secure`。

- [ ] **步骤 3：实现管理接口**

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/overview?range=7|30`
- `GET /api/admin/health`

所有读取接口先验证会话，且绝不返回访客哈希。

- [ ] **步骤 4：运行认证和 API 测试**

运行：`node --test server/admin-auth.test.js server/app.test.js`

预期：全部通过。

- [ ] **步骤 5：提交任务 3**

```bash
git add server/admin-auth.js server/admin-auth.test.js server/app.js server/app.test.js server/index.js
git commit -m "feat: protect the weather admin API"
```

### 任务 4：管理后台界面

**文件：**
- 创建：`src/AdminApp.jsx`
- 创建：`src/admin.css`
- 修改：`src/main.jsx`

- [ ] **步骤 1：增加路径入口**

```js
const RootApp = window.location.pathname.startsWith("/admin") ? AdminApp : App;
createRoot(document.getElementById("root")).render(<RootApp />);
```

- [ ] **步骤 2：实现登录和会话恢复**

登录表单只保留密码 state，不写入 localStorage。加载 `/api/admin/overview` 返回 401 时显示登录页；成功后显示后台。

- [ ] **步骤 3：实现后台内容**

展示 7/30 天切换、访问量、匿名日活、城市选择、提醒启用、通知发送、场景占比、每日趋势、错误计数、运行模式、缓存状态和启动时间。无数据时显示空状态，不填充示例。

- [ ] **步骤 4：浏览器验证**

验证未登录、错误密码、成功登录、切换时间范围、刷新会话、注销和 390px 移动布局。

- [ ] **步骤 5：运行构建**

运行：`npm test && npm run build`

预期：全部成功。

- [ ] **步骤 6：提交任务 4**

```bash
git add src/AdminApp.jsx src/admin.css src/main.jsx
git commit -m "feat: add a lightweight weather admin dashboard"
```

### 任务 5：配置、隐私文档与最终验证

**文件：**
- 修改：`.env.example`
- 修改：`README.md`
- 修改：`README.en.md`
- 修改：`docs/deployment.md`
- 修改：`SECURITY.md`

- [ ] **步骤 1：增加配置**

```bash
ANALYTICS_ENABLED=true
ANALYTICS_HASH_SECRET=replace-with-a-random-secret
ADMIN_PASSWORD=
```

未配置 `ADMIN_PASSWORD` 时后台关闭；未配置哈希密钥时统计关闭并记录警告。

- [ ] **步骤 2：记录隐私边界**

文档明确事件类型、30 天保留、不收集 IP/搜索词/精确位置、关闭方式和单实例限制。

- [ ] **步骤 3：运行最终验证**

运行：`npm test && npm run build && git diff --check`

预期：全部测试、构建和差异检查通过。

- [ ] **步骤 4：提交任务 5**

```bash
git add .env.example README.md README.en.md docs/deployment.md SECURITY.md
git commit -m "docs: document admin analytics privacy"
```
