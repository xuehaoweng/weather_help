# Weather Pro 决策体验 MVP 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 交付场景差异化建议、本机雨前提醒、当前位置与常用地点、可解释评分和移动端首屏重排。

**架构：** 服务端纯函数建议引擎负责生成三种场景建议、评分因素和数据元信息；前端用独立本地存储与提醒规则模块管理浏览器能力，React 组件只负责交互与展示。现有核心/详情渐进加载继续保留，详情到达后合并为更完整的建议。

**技术栈：** Node.js test runner、Express 4、React 19、Vite 6、Browser Notification API、Geolocation API、localStorage

---

## 文件结构

- 创建：`server/advice-engine.js`、`server/advice-engine.test.js`，生成评分解释与三种场景建议。
- 修改：`server/weather-service.js`、`server/weather-service.test.js`，整合核心和详情建议元数据。
- 修改：`server/app.js`、`server/app.test.js`、`server/mock-data.js`，支持经纬度地点查询与最近 Mock 城市。
- 创建：`src/reminder-store.js`、`src/reminder-store.test.js`，提醒配置持久化和迁移。
- 创建：`src/reminder-engine.js`、`src/reminder-engine.test.js`，提醒触发、时段和去重规则。
- 创建：`src/favorite-locations.js`、`src/favorite-locations.test.js`，常用地点持久化。
- 创建：`src/components/LocationPicker.jsx`、`ReminderSettings.jsx`、`ScoreDetails.jsx`、`ScenarioPanel.jsx`、`MobileSummary.jsx`，拆分交互组件。
- 修改：`src/main.jsx`、`src/styles.css`，接入新模块并重排移动端。
- 修改：`README.md`、`README.en.md`、`.env.example`，记录功能与浏览器限制。

### 任务 1：场景建议与评分引擎

**文件：**
- 创建：`server/advice-engine.test.js`
- 创建：`server/advice-engine.js`

- [ ] **步骤 1：编写三种场景和评分因素的失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildWeatherInsight } from "./advice-engine.js";

const rainy = {
  now: { text: "中雨", temp: "27", feelsLike: "24", windSpeed: "28", precip: "2.4" },
  today: { uvIndex: "11" },
  warnings: [],
  minutely: [{ fxTime: "2026-07-16T10:55+08:00", precip: "0.8" }],
  indices: [{ type: "1", category: "较适宜" }],
  updatedAt: "2026-07-16T10:35:00.000Z",
  source: "Mock"
};

test("returns different commute, outdoor, and family advice", () => {
  const insight = buildWeatherInsight(rainy);
  assert.match(insight.scenarios.commute.headline, /提前|带伞/);
  assert.match(insight.scenarios.outdoor.headline, /暂停|改期|不适合/);
  assert.match(insight.scenarios.family.headline, /儿童|老人|家人/);
  assert.notDeepEqual(insight.scenarios.commute.decisions, insight.scenarios.outdoor.decisions);
});

test("score factors explain the final value", () => {
  const score = buildWeatherInsight(rainy).score;
  assert.equal(score.value, score.base + score.factors.reduce((sum, item) => sum + item.impact, 0));
  assert.deepEqual(score.factors.map((item) => item.key), ["rain", "wind", "uv"]);
});
```

- [ ] **步骤 2：运行测试确认模块尚不存在**

运行：`node --test server/advice-engine.test.js`

预期：FAIL，报错 `ERR_MODULE_NOT_FOUND`。

- [ ] **步骤 3：实现统一建议结构**

`buildWeatherInsight(input)` 返回：

```js
{
  title,
  score: { value, label, base: 92, factors },
  commuteScore: { value, label, base: 92, factors },
  scenarios: {
    commute: { mode: "commute", headline, summary, decisions },
    outdoor: { mode: "outdoor", headline, summary, decisions },
    family: { mode: "family", headline, summary, decisions }
  },
  rainSummary,
  firstRainAt,
  maxPrecip,
  updatedAt,
  source,
  isPartial
}
```

每个 `decision` 使用 `{ key, status: "ok" | "warn" | "danger" | "unknown", label, value, reason }`。

- [ ] **步骤 4：运行建议引擎测试**

运行：`node --test server/advice-engine.test.js`

预期：全部通过。

- [ ] **步骤 5：提交任务 1**

```bash
git add server/advice-engine.js server/advice-engine.test.js
git commit -m "feat: add scenario-specific weather advice"
```

### 任务 2：整合渐进天气数据和可信度元信息

**文件：**
- 修改：`server/weather-service.js`
- 修改：`server/weather-service.test.js`
- 修改：`src/weather-loader.test.js`

- [ ] **步骤 1：扩展服务测试**

新增断言：

```js
assert.ok(core.body.insight.scenarios.commute);
assert.equal(core.body.insight.source, "QWeather");
assert.equal(core.body.insight.isPartial, false);
assert.ok(core.body.insight.updatedAt);
assert.ok(full.body.insight.scenarios.outdoor);
assert.ok(full.body.insight.firstRainAt);
```

部分失败测试增加：

```js
assert.equal(result.body.insight.isPartial, true);
```

- [ ] **步骤 2：运行服务测试验证失败**

运行：`node --test server/weather-service.test.js src/weather-loader.test.js`

预期：新 `scenarios`、`source` 或 `isPartial` 断言失败。

- [ ] **步骤 3：用建议引擎替换旧内联评分逻辑**

`weather-service.js` 调用：

```js
buildWeatherInsight({
  now: data.now?.now,
  today: data.daily?.daily?.[0],
  hourly: data.hourly?.hourly || [],
  warnings: data.warning?.warning || [],
  minutely: data.minutely?.minutely || [],
  indices: data.indices?.daily || [],
  updatedAt: new Date(now()).toISOString(),
  source: useMock ? "Mock" : "QWeather",
  isPartial: data.errors.length > 0
});
```

为 `createWeatherService` 增加可注入 `now`，保证时间测试稳定。核心响应先生成无分钟降雨的建议，详情合并后覆盖 `rainSummary`、雨时段和场景建议。

- [ ] **步骤 4：验证渐进合并保留最新建议**

更新 `mergeWeatherData` 测试，确认详情 `insight.scenarios` 覆盖核心版本，同时保留核心错误并合并详情错误。

- [ ] **步骤 5：运行相关测试**

运行：`node --test server/weather-service.test.js src/weather-loader.test.js`

预期：全部通过。

- [ ] **步骤 6：提交任务 2**

```bash
git add server/weather-service.js server/weather-service.test.js src/weather-loader.test.js
git commit -m "feat: explain weather scores and data freshness"
```

### 任务 3：提醒与常用地点本地规则

**文件：**
- 创建：`src/reminder-store.js`
- 创建：`src/reminder-store.test.js`
- 创建：`src/reminder-engine.js`
- 创建：`src/reminder-engine.test.js`
- 创建：`src/favorite-locations.js`
- 创建：`src/favorite-locations.test.js`

- [ ] **步骤 1：编写存储模块失败测试**

测试必须覆盖：

```js
assert.deepEqual(loadReminder(storage), DEFAULT_REMINDER);
assert.equal(saveReminder(storage, validReminder).version, 1);
assert.deepEqual(loadReminder(corruptStorage), DEFAULT_REMINDER);
assert.equal(addFavorite(storage, location).length, 1);
assert.equal(addFavorite(storage, location).length, 1);
assert.throws(() => addFavorite(storageWithFive, sixth), /最多保存 5 个/);
```

- [ ] **步骤 2：编写提醒规则失败测试**

```js
const result = evaluateReminder({
  config: { enabled: true, leadMinutes: 20, activeStart: "07:00", activeEnd: "22:00" },
  firstRainAt: "2026-07-16T10:55:00+08:00",
  now: new Date("2026-07-16T10:40:00+08:00"),
  locationId: "101020100"
});
assert.equal(result.shouldNotify, true);
assert.equal(result.notificationKey, "101020100:2026-07-16T10:55:00+08:00");
```

同时覆盖时段外、超过提前量、相同去重键和跨午夜时段。

- [ ] **步骤 3：运行测试验证失败**

运行：`node --test src/reminder-store.test.js src/reminder-engine.test.js src/favorite-locations.test.js`

预期：三个模块不存在。

- [ ] **步骤 4：实现版本化 localStorage 模块**

使用依赖注入的 storage 参数，不直接在纯函数测试中访问浏览器。损坏 JSON、未知版本和非法字段恢复默认值。常用地点按 `id` 去重并限制五个。

- [ ] **步骤 5：实现纯提醒判断**

`evaluateReminder` 只返回结果，不调用 Notification：

```js
{
  shouldNotify: true,
  notificationKey,
  title: "上海 15 分钟后可能下雨",
  body: "中雨，出门请带伞并注意大风"
}
```

- [ ] **步骤 6：运行本地规则测试**

运行：`node --test src/reminder-store.test.js src/reminder-engine.test.js src/favorite-locations.test.js`

预期：全部通过。

- [ ] **步骤 7：提交任务 3**

```bash
git add src/reminder-store.js src/reminder-store.test.js src/reminder-engine.js src/reminder-engine.test.js src/favorite-locations.js src/favorite-locations.test.js
git commit -m "feat: add local reminders and favorite locations"
```

### 任务 4：当前位置与 Mock 最近地点

**文件：**
- 修改：`server/mock-data.js`
- 修改：`server/app.js`
- 修改：`server/app.test.js`

- [ ] **步骤 1：编写坐标地点查询测试**

```js
const nearest = await handlers.locations({ q: "121.47,31.23" });
assert.equal(nearest.status, 200);
assert.equal(nearest.body.locations[0].name, "上海");
```

真实模式测试确认 `lookupLocations` 收到原始坐标字符串。

- [ ] **步骤 2：运行 API 测试验证失败**

运行：`node --test server/app.test.js`

预期：Mock 坐标查询返回空数组。

- [ ] **步骤 3：实现最近 Mock 城市**

解析 `lon,lat`，校验范围，用平方距离选择最近城市；普通关键词继续使用现有匹配逻辑。非法坐标返回 `INVALID_LOCATION`。

- [ ] **步骤 4：运行 API 测试**

运行：`node --test server/app.test.js`

预期：全部通过。

- [ ] **步骤 5：提交任务 4**

```bash
git add server/mock-data.js server/app.js server/app.test.js
git commit -m "feat: resolve the nearest mock weather location"
```

### 任务 5：接入地点、提醒和场景组件

**文件：**
- 创建：`src/components/LocationPicker.jsx`
- 创建：`src/components/ReminderSettings.jsx`
- 创建：`src/components/ScoreDetails.jsx`
- 创建：`src/components/ScenarioPanel.jsx`
- 创建：`src/components/MobileSummary.jsx`
- 修改：`src/main.jsx`

- [ ] **步骤 1：拆分地点选择组件**

`LocationPicker` 接收：

```js
{
  query, results, searching, error, location, favorites,
  onQueryChange, onSearch, onSelect, onUseCurrentLocation,
  onAddFavorite, onRemoveFavorite
}
```

定位只在按钮点击后调用 `navigator.geolocation.getCurrentPosition`，成功后请求 `/api/locations?q=${lon},${lat}`。

- [ ] **步骤 2：实现提醒设置对话框**

对话框展示本机限制、地点、10/20/30 分钟和生效时段。只有用户点击“允许通知”时执行 `Notification.requestPermission()`。不支持或拒绝时切换为页面内提示。

- [ ] **步骤 3：在 App 中运行提醒检查器**

使用一个 effect：

```js
useEffect(() => {
  if (!reminder.enabled) return;
  const check = () => checkAndNotify({ reminder, weather, location, NotificationImpl: window.Notification });
  check();
  const timer = window.setInterval(check, 5 * 60 * 1000);
  const onVisibility = () => document.visibilityState === "visible" && check();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}, [reminder, weather, location]);
```

发送成功后保存 `lastNotificationKey`。

- [ ] **步骤 4：替换通用 Scenario 组件**

`ScenarioPanel` 直接渲染 `weather.insight.scenarios[mode]` 的 headline、summary 和 decisions。状态颜色由 `status` 决定，并显示 `reason`。

- [ ] **步骤 5：接入评分解释和数据元信息**

评分卡增加“查看评分依据”按钮，展开 `ScoreDetails`，显示基础分、扣分因素、更新时间、数据来源和“部分数据暂不可用”状态。

- [ ] **步骤 6：隐藏未实现会员购买**

删除价格、购买按钮和首屏“付费买……”文案。可保留不带 CTA 的开源 Roadmap 提示。

- [ ] **步骤 7：运行全量测试和构建**

运行：`npm test && npm run build`

预期：全部测试通过，Vite 构建成功。

- [ ] **步骤 8：提交任务 5**

```bash
git add src/main.jsx src/components
git commit -m "feat: connect actionable weather decision flows"
```

### 任务 6：移动端首屏与可访问性

**文件：**
- 修改：`src/styles.css`
- 修改：`src/main.jsx`

- [ ] **步骤 1：增加语义状态**

搜索框添加 `<label className="sr-only" htmlFor="location-search">`；场景按钮添加 `aria-pressed={mode === key}`；对话框使用 `role="dialog"`、`aria-modal="true"` 和标题关联。

- [ ] **步骤 2：增加键盘焦点样式**

```css
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 3px solid #f2b84b;
  outline-offset: 3px;
}
```

- [ ] **步骤 3：移动端重排**

在 `max-width: 640px` 下使用 grid areas 或组件顺序，使移动摘要位于说明文案前；主标题限制两行并使用 `clamp(34px, 10vw, 46px)`，按钮最小尺寸 `44px`。

- [ ] **步骤 4：浏览器验证**

以 1365×900 和 390×844 验证：

- 桌面场景建议差异。
- 移动端首屏出现地点、建议、温度、降雨和评分。
- 无横向溢出。
- Tab 键焦点清晰。
- 通知权限只在明确点击后请求。

- [ ] **步骤 5：运行验证**

运行：`npm test && npm run build && git diff --check`

预期：全部成功。

- [ ] **步骤 6：提交任务 6**

```bash
git add src/main.jsx src/styles.css
git commit -m "feat: prioritize mobile weather decisions"
```

### 任务 7：文档和最终验证

**文件：**
- 修改：`README.md`
- 修改：`README.en.md`
- 修改：`ROADMAP.md`

- [ ] **步骤 1：更新产品能力说明**

记录三种真实场景建议、本机提醒限制、当前位置、常用地点和评分解释。明确浏览器关闭后本机提醒不保证触发。

- [ ] **步骤 2：更新 Roadmap**

将已完成项目移出 Near Term；后台 Web Push、账号同步和付费保留为未来能力。

- [ ] **步骤 3：运行最终验证**

运行：`npm test && npm run build && git diff --check`

预期：全部成功且工作区只包含计划内文档变更。

- [ ] **步骤 4：提交任务 7**

```bash
git add README.md README.en.md ROADMAP.md
git commit -m "docs: explain local weather decision features"
```

