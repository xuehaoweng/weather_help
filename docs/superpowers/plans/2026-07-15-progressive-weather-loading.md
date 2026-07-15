# 渐进式天气加载实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让核心天气不再等待分钟降雨与生活指数，并通过请求去重、完整超时和磁盘缓存降低冷启动与重启后的等待。

**架构：** 服务端拆成可注入依赖的 QWeather 客户端、天气聚合服务和 Express app；默认 `/api/weather` 返回四项核心数据，`/api/weather/details` 返回两项详情，`full=true` 保留完整聚合。前端 loader 并发请求两阶段数据，以 generation 隔离城市并在 core 成功后合并 details。

**技术栈：** Node.js ESM、Express 4、原生 Fetch/AbortController、React 19、Node test runner、Vite。

---

## 文件结构

- 创建 `server/qweather-client.js`：上游请求、超时、内存/磁盘缓存和 inflight 去重。
- 创建 `server/qweather-client.test.js`：客户端缓存、超时、并发和持久化测试。
- 创建 `server/weather-service.js`：参数验证、三种聚合模式、结构化错误和洞察计算。
- 创建 `server/weather-service.test.js`：核心/详情/完整聚合与失败契约测试。
- 创建 `server/app.js`：可注入 weather service 的 Express 路由和静态资源配置。
- 创建 `server/app.test.js`：真实 HTTP 状态码、参数与 mock 语义测试。
- 修改 `server/index.js`：只负责环境装载、依赖组装、监听和优雅退出。
- 修改 `server/mock-data.js`：按核心与详情选择 mock payload。
- 修改 `src/weather-loader.js`：两阶段并发 loader 与同代合并规则。
- 修改 `src/weather-loader.test.js`：详情先到、失败与城市切换竞态测试。
- 修改 `src/main.jsx`：拆分 core/details UI 状态并局部展示详情骨架/错误。
- 修改 `src/styles.css`：详情局部错误提示样式。
- 修改 `.gitignore`：忽略 `.cache/`。
- 修改 `package.json`：把服务端测试纳入 `npm test`。

### 任务 1：QWeather 客户端

**文件：**
- 创建：`server/qweather-client.js`
- 创建：`server/qweather-client.test.js`
- 修改：`.gitignore`
- 修改：`package.json`

- [ ] **步骤 1：编写失败的客户端测试**

测试使用临时目录、可控 `fetchImpl` 与短超时，覆盖同 URL 并发只 fetch 一次、失败后可重试、响应体挂起被 abort、跨实例磁盘命中、过期/损坏 schema 忽略，以及 flush 期间更新最终写入最新版：

```js
test("deduplicates concurrent requests and retries after failure", async () => {
  let calls = 0;
  const client = createQWeatherClient({ apiKey: "key", cachePath, fetchImpl: async () => {
    calls += 1;
    if (calls === 1) throw new Error("offline");
    return jsonResponse({ code: "200", value: calls });
  }});
  await assert.rejects(Promise.all([client.request(spec), client.request(spec)]));
  assert.equal(calls, 1);
  assert.equal((await client.request(spec)).value, 2);
  await client.close();
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test server/qweather-client.test.js`
预期：FAIL，报错无法找到 `server/qweather-client.js`。

- [ ] **步骤 3：实现最小客户端**

导出稳定错误与工厂；`request` 用不含 API Key 的 URL 作缓存键，完整操作由 AbortController 控制，inflight 在 `finally` 条件删除：

```js
export class QWeatherError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "QWeatherError";
    this.code = code;
  }
}

export function createQWeatherClient(options) {
  const timeoutMs = positiveTimeout(options.timeoutMs, 4000);
  const memory = new Map();
  const inflight = new Map();
  async function request({ host, endpoint, params, ttlMs }) {
    const url = buildUrl(host, endpoint, params);
    const hit = fresh(memory.get(url), ttlMs, options.now?.() ?? Date.now());
    if (hit) return hit.data;
    if (inflight.has(url)) return inflight.get(url);
    const pending = fetchAndCache(url, ttlMs).finally(() => {
      if (inflight.get(url) === pending) inflight.delete(url);
    });
    inflight.set(url, pending);
    return pending;
  }
  return { request, close: flushLatest };
}
```

磁盘 writer 使用 `schemaVersion: 1`，单写 Promise 和 dirty version 循环，每轮写唯一临时文件后 rename；读取仅恢复结构有效且未过期的条目。`close()` 取消 debounce 并等待最新版本落盘。

- [ ] **步骤 4：运行客户端测试验证通过**

运行：`node --test server/qweather-client.test.js`
预期：所有客户端测试 PASS，进程无悬挂 timer。

- [ ] **步骤 5：接入测试命令并提交**

将 `package.json` 的 test 改为 `node --test src/*.test.js server/*.test.js`，将 `.cache/` 加入 `.gitignore`。

运行：`npm test`
预期：新旧测试全部 PASS。

提交：`git add .gitignore package.json server/qweather-client.js server/qweather-client.test.js && git commit -m "feat: add resilient qweather client"`

### 任务 2：天气聚合服务与 HTTP 契约

**文件：**
- 创建：`server/weather-service.js`
- 创建：`server/weather-service.test.js`
- 创建：`server/app.js`
- 创建：`server/app.test.js`
- 修改：`server/mock-data.js`
- 修改：`server/index.js`

- [ ] **步骤 1：编写失败的聚合与路由测试**

用记录 endpoint 的假 client 验证 core=4、details=2、full=6；用随机端口启动 `createWeatherApp` 验证状态码：

```js
test("core and details request independent upstream groups", async () => {
  const calls = [];
  const service = createWeatherService({ client: fakeClient(calls), apiHost: "api.test" });
  const core = await service.getCore(validQuery);
  assert.deepEqual(calls, ["/v7/weather/now", "/v7/weather/7d", "/v7/weather/24h", "/v7/warning/now"]);
  calls.length = 0;
  const details = await service.getDetails(validQuery);
  assert.deepEqual(calls, ["/v7/minutely/5m", "/v7/indices/1d"]);
  assert.equal(core.status, 200);
  assert.equal(details.status, 200);
});

test("all core failures return structured 502", async () => {
  const result = await failingService().getCore(validQuery);
  assert.equal(result.status, 502);
  assert.equal(result.body.error.code, "CORE_WEATHER_UNAVAILABLE");
  assert.equal(result.body.errors.length, 4);
});
```

另覆盖部分失败 200、details/full 全失败、非法/越界/单边经纬度 400、mock 三模式字段，以及 `full=true` 的完整 insight。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test server/weather-service.test.js server/app.test.js`
预期：FAIL，两个模块尚不存在。

- [ ] **步骤 3：实现聚合服务**

定义 upstream specs，统一将 settled 结果变为字段与错误：

```js
const CORE = [spec("now", "/v7/weather/now"), spec("daily", "/v7/weather/7d"), spec("hourly", "/v7/weather/24h"), spec("warning", "/v7/warning/now")];
const DETAILS = [spec("minutely", "/v7/minutely/5m"), spec("indices", "/v7/indices/1d")];

async function aggregate(specs, query, unavailableCode, insightBuilder) {
  const input = normalizeWeatherQuery(query);
  const settled = await Promise.allSettled(specs.map((item) => client.request(resolveSpec(item, input))));
  const body = toPayload(input, specs, settled);
  body.insight = insightBuilder(body);
  const allFailed = settled.every((item) => item.status === "rejected");
  if (allFailed) body.error = publicError(unavailableCode);
  return { status: allFailed ? 502 : 200, body };
}
```

核心 insight 用 `now.precip`；详情 insight 只返回雨情三字段；full insight 保留分钟雨参与评分和标题。`normalizeWeatherQuery` 对非法参数抛出 `INVALID_LOCATION`。

- [ ] **步骤 4：实现可注入 Express app 与 mock 分组**

```js
export function createWeatherApp({ weatherService, useMock, productionDir }) {
  const app = express();
  app.get("/api/weather", route(async (req) => req.query.full === "true"
    ? weatherService.getFull(req.query)
    : weatherService.getCore(req.query)));
  app.get("/api/weather/details", route((req) => weatherService.getDetails(req.query)));
  return app;
}
```

mock service 从 `mockWeatherPayload` 选择 core/details/full 字段，并走相同参数校验。`server/index.js` 只组装 client/service/app；SIGTERM/SIGINT 调用 `server.close()` 后 await `client.close()`。

- [ ] **步骤 5：运行服务端测试并提交**

运行：`node --test server/qweather-client.test.js server/weather-service.test.js server/app.test.js`
预期：全部 PASS。

提交：`git add server && git commit -m "feat: split weather API into progressive endpoints"`

### 任务 3：两阶段前端 loader

**文件：**
- 修改：`src/weather-loader.js`
- 修改：`src/weather-loader.test.js`

- [ ] **步骤 1：把 loader 测试改为两阶段契约**

```js
test("buffers details until matching core succeeds", async () => {
  const core = deferred();
  const details = deferred();
  const events = [];
  const load = loaderFor({ core, details }).load(target("b"), phaseCallbacks(events));
  details.resolve(response({ location: "b", minutely: { minutely: [] } }));
  await tick();
  assert.deepEqual(events, ["loading"]);
  core.resolve(response({ location: "b", now: { now: {} } }));
  await load;
  assert.deepEqual(events, ["loading", "core:b", "details:b", "settled"]);
});
```

增加 A 已显示后切 B、B details 先到；详情 502 只触发 `onDetailsError`；core 502 不展示已缓存 details；取消和旧 finally 不写新代。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test src/weather-loader.test.js`
预期：FAIL，当前 loader 只发一个请求且没有 phase callbacks。

- [ ] **步骤 3：实现 generation 隔离和详情缓冲**

`load` 同时创建 core/details promise，请求 URL 分别为 `/api/weather?...` 与 `/api/weather/details?...`；内部槽位保存 `{ generation, locationKey, core, details }`。只有当前 generation/locationKey 且 core 成功时调用 `onDetailsSuccess`；错误消息优先读取 `data.error.message`，兼容字符串 `data.error`。

公开 callbacks：`onLoading`、`onCoreSuccess`、`onCoreError`、`onCoreSettled`、`onDetailsSuccess`、`onDetailsError`、`onDetailsSettled`。`load()` 返回等待两阶段结束的 Promise。

- [ ] **步骤 4：运行 loader 测试并提交**

运行：`node --test src/weather-loader.test.js`
预期：全部 PASS。

提交：`git add src/weather-loader.js src/weather-loader.test.js && git commit -m "feat: load weather details progressively"`

### 任务 4：React 局部加载与错误状态

**文件：**
- 修改：`src/main.jsx`
- 修改：`src/styles.css`

- [ ] **步骤 1：接入独立 core/details 状态**

新增 `detailsStatus` 与 `detailsError`；core 成功替换 weather，details 成功仅在 loader 同代保证下合并：

```jsx
onCoreSuccess: (core) => {
  setWeather(core);
  setWeatherStatus("success");
},
onDetailsSuccess: (details) => {
  setWeather((core) => ({
    ...core,
    ...details,
    insight: { ...core?.insight, ...details.insight }
  }));
  setDetailsStatus("success");
},
onDetailsError: (error) => {
  setDetailsError(error.message);
  setDetailsStatus("error");
}
```

切换地点时清空旧 weather/details；WeatherPanel 和 Forecast 只依赖 core loading。RainTimeline、Scenario 接收 `detailsStatus/detailsError`，loading 显示现有局部骨架，error 显示 `role="status"` 的“详情暂不可用”，成功显示数据。降雨 quick fact 在详情 loading 时显示“分析中”。

- [ ] **步骤 2：补充局部状态样式**

```css
.detail-status {
  min-height: 7rem;
  display: grid;
  place-items: center;
  color: var(--muted);
  border: 1px dashed var(--line);
  border-radius: 16px;
}
```

保持现有响应式断点与 `prefers-reduced-motion` 行为。

- [ ] **步骤 3：运行全套测试与构建并提交**

运行：`npm test && npm run build`
预期：全部测试 PASS，Vite 构建成功且无 warning/error。

提交：`git add src/main.jsx src/styles.css && git commit -m "feat: render weather details progressively"`

### 任务 5：真实服务性能与浏览器验收

**文件：**
- 修改（仅发现问题时）：上述实现文件与对应测试

- [ ] **步骤 1：启动隔离端口的真实服务**

运行：`NODE_ENV=production PORT=8878 node server/index.js`
预期：health 返回 `mode: "qweather"`，且日志不输出 API Key。

- [ ] **步骤 2：测量冷、热与完整接口**

对 location `101200204`、lon `111.84442`、lat `31.77692` 分别请求 core、details、`full=true`，每项 3 次取中位数。预期：core 中位数 ≤2.5s 或比 full 至少快 20%；第二次内存命中 <50ms。优雅重启后磁盘命中 <100ms。

- [ ] **步骤 3：真实浏览器验收**

打开 `http://localhost:8878`，验证核心面板先显示，RainTimeline/Scenario 局部骨架后消失；快速从 A 切 B 时没有 A/B 数据混合；浏览器控制台无错误。

- [ ] **步骤 4：最终回归与提交修正**

运行：`npm test && npm run build && git diff --check && git status --short`
预期：全部通过；只包含计划内文件；没有 `.cache` 或构建产物被跟踪。

若验收产生修正，提交：`git add server src package.json .gitignore && git commit -m "fix: harden progressive weather loading"`
