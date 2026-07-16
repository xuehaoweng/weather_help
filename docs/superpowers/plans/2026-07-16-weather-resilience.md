# 天气数据容错与友好降级实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 消除上游短暂超时导致的空温度、裸单位和错误低温判断，并通过重试、有限过期缓存及明确空状态保持页面可用。

**架构：** 在 `QWeatherClient` 边界处理可恢复网络错误和实时天气的有限过期缓存，通过非序列化标记把缓存状态传给聚合服务；服务端输出 `staleSources`，前端组件据此渲染延迟提示或实时天气不可用状态。预警维持严格的新鲜度要求。

**技术栈：** Node.js、原生 Fetch、Express、React 19、Node Test Runner、Vite

---

## 文件结构

- 修改 `server/qweather-client.js`：实现可恢复错误重试、有限过期缓存和非序列化缓存状态标记。
- 修改 `server/qweather-client.test.js`：覆盖重试次数、不可重试错误、过期缓存窗口和预警严格模式。
- 修改 `server/weather-service.js`：仅为实时天气配置 30 分钟兜底，并输出 `staleSources`。
- 修改 `server/weather-service.test.js`：验证缓存状态进入公开 API 元数据。
- 修改 `shared/advice-engine.js`：缺失温度不再被转换为 `0℃`。
- 修改 `shared/advice-engine.test.js`：验证缺失温度不产生低温扣分。
- 创建 `src/components/CurrentConditions.js`：独立渲染当前天气、延迟提示和不可用状态。
- 修改 `src/components/MobileSummary.js`：缺失温度显示“暂不可用”，不拼接温度单位。
- 修改 `src/components/components.test.js`：验证页面不生成裸单位或虚假零值。
- 修改 `src/main.jsx`：接入当前天气组件及 `staleSources`。
- 修改 `src/styles.css`：为实时天气不可用和延迟提示提供最小样式。

### 任务 1：可恢复上游错误重试

**文件：**
- 修改：`server/qweather-client.test.js`
- 修改：`server/qweather-client.js`

- [x] **步骤 1：编写失败的重试测试**

在 `server/qweather-client.test.js` 增加：

```js
test("retries recoverable network errors twice before succeeding", async (t) => {
  const cachePath = await temporaryCache(t);
  let calls = 0;
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new Error("offline");
      return jsonResponse({ code: "200", marker: "recovered" });
    }
  });

  assert.equal((await client.request(spec)).marker, "recovered");
  assert.equal(calls, 3);
  await client.close();
});

test("does not retry invalid upstream payloads", async (t) => {
  const cachePath = await temporaryCache(t);
  let calls = 0;
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ code: "401" });
    }
  });

  await assert.rejects(client.request(spec), { code: "UPSTREAM_INVALID_RESPONSE" });
  assert.equal(calls, 1);
});
```

- [x] **步骤 2：运行测试验证失败**

运行：

```bash
node --test server/qweather-client.test.js
```

预期：新增重试测试失败，因为第一次网络错误仍直接抛出。

- [x] **步骤 3：实现最少重试逻辑**

在 `createQWeatherClient` 中接收 `sleepImpl`，并让 `fetchAndCache` 对 `UPSTREAM_TIMEOUT`、`UPSTREAM_NETWORK_ERROR` 最多额外尝试两次：

```js
const sleep = options.sleepImpl || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
const retryDelays = [150, 400];

async function fetchWithRetry(url) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchOnce(url);
    } catch (error) {
      if (!isRecoverable(error) || attempt >= retryDelays.length) throw error;
      await sleep(retryDelays[attempt]);
    }
  }
}
```

保持单次请求的超时控制在 `fetchOnce` 内，避免一个已触发的计时器跨越多次尝试。

- [x] **步骤 4：运行测试验证通过**

运行：

```bash
node --test server/qweather-client.test.js
```

预期：全部通过。

- [x] **步骤 5：提交**

```bash
git add server/qweather-client.js server/qweather-client.test.js
git commit -m "fix: retry transient weather network failures"
```

### 任务 2：实时天气有限过期缓存

**文件：**
- 修改：`server/qweather-client.test.js`
- 修改：`server/qweather-client.js`
- 修改：`server/weather-service.test.js`
- 修改：`server/weather-service.js`

- [x] **步骤 1：编写失败的缓存与服务测试**

增加客户端测试：

```js
test("returns marked stale data inside stale-if-error window", async (t) => {
  const cachePath = await temporaryCache(t);
  let current = 10_000;
  let offline = false;
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath,
    now: () => current,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      if (offline) throw new Error("offline");
      return jsonResponse({ code: "200", marker: "cached" });
    }
  });
  await client.request({ ...spec, ttlMs: 1_000, staleIfErrorMs: 30_000 });
  current = 12_000;
  offline = true;

  const result = await client.request({ ...spec, ttlMs: 1_000, staleIfErrorMs: 30_000 });
  assert.equal(result.marker, "cached");
  assert.equal(isStaleWeatherData(result), true);
});
```

增加超过窗口仍抛错的测试，以及 `weather-service.test.js` 中实时天气 stale 时 `body.staleSources` 等于 `["now"]`、预警失败不进入 staleSources 的测试。

- [x] **步骤 2：运行测试验证失败**

运行：

```bash
node --test server/qweather-client.test.js server/weather-service.test.js
```

预期：因 `staleIfErrorMs` 和 `isStaleWeatherData` 尚未实现而失败。

- [x] **步骤 3：实现缓存标记和服务传播**

在客户端导出 Symbol 检测函数：

```js
const STALE_WEATHER_DATA = Symbol("stale-weather-data");

export function isStaleWeatherData(value) {
  return Boolean(value?.[STALE_WEATHER_DATA]);
}
```

网络重试耗尽后，如果缓存年龄不超过 `staleIfErrorMs`，克隆缓存数据并用不可枚举 Symbol 标记后返回。不要修改内存中的原始缓存对象，也不要把标记写入磁盘。

在 `CORE_SPECS` 中仅给实时天气加入：

```js
{ source: "now", endpoint: "/v7/weather/now", ttlMs: 8 * 60 * 1000, staleIfErrorMs: 30 * 60 * 1000 }
```

聚合成功结果时检测 stale 标记，并输出：

```js
body.staleSources = [];
if (isStaleWeatherData(result.value)) body.staleSources.push(source);
```

- [x] **步骤 4：运行测试验证通过**

运行：

```bash
node --test server/qweather-client.test.js server/weather-service.test.js
```

预期：全部通过。

- [x] **步骤 5：提交**

```bash
git add server/qweather-client.js server/qweather-client.test.js server/weather-service.js server/weather-service.test.js
git commit -m "fix: serve recent weather cache during outages"
```

### 任务 3：前端友好空状态与缺失值计算

**文件：**
- 创建：`src/components/CurrentConditions.js`
- 修改：`src/components/components.test.js`
- 修改：`src/components/MobileSummary.js`
- 修改：`src/main.jsx`
- 修改：`src/styles.css`
- 修改：`shared/advice-engine.js`
- 修改：`shared/advice-engine.test.js`

- [x] **步骤 1：编写失败的渲染和建议测试**

在组件测试中渲染缺失状态：

```js
const html = renderToStaticMarkup(
  h(CurrentConditions, { now: null, weatherKind: "cloudy", onRetry: () => {} })
);
assert.match(html, /实时天气暂不可用/);
assert.match(html, /重新加载/);
assert.doesNotMatch(html, /0°|>°<|湿度 %|能见度 km|--°/);
```

增加 stale 状态测试，要求包含“实时数据更新延迟，正在使用最近数据”。同时给 `MobileSummary` 增加缺失 `now` 测试。

在 `shared/advice-engine.test.js` 增加：

```js
test("missing current temperature is not treated as zero degrees", () => {
  const insight = buildWeatherInsight({ now: {}, today: {} });
  assert.equal(insight.score.factors.some((item) => item.key === "temperature"), false);
});
```

- [x] **步骤 2：运行测试验证失败**

运行：

```bash
node --test src/components/components.test.js shared/advice-engine.test.js
```

预期：`CurrentConditions` 不存在，且缺失温度仍产生低温扣分。

- [x] **步骤 3：实现最小前端组件与计算修复**

创建 `CurrentConditions`：

```js
export function CurrentConditions({ now, weatherKind, stale = false, onRetry }) {
  if (!now || !hasValue(now.temp)) {
    return h("div", { className: "current-weather-unavailable", role: "status" },
      h("strong", null, "实时天气暂不可用"),
      h("p", null, "其他预报仍可查看，你可以重新加载实时天气。"),
      h("button", { type: "button", onClick: onRetry }, "重新加载")
    );
  }
  // 正常天气内容；湿度和能见度分别按字段存在性决定是否显示。
}
```

`MobileSummary` 在没有温度时使用“暂不可用”。`main.jsx` 用 `weather?.staleSources?.includes("now")` 传入 stale 状态。

在建议引擎中给温度使用可选数字：

```js
function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
```

只将 `temp` 改为 `optionalNumber(now.temp)`，降雨和风速继续使用零作为缺失兜底。

- [x] **步骤 4：运行聚焦测试验证通过**

运行：

```bash
node --test src/components/components.test.js shared/advice-engine.test.js
```

预期：全部通过，输出中没有 React 警告。

- [x] **步骤 5：提交**

```bash
git add src/components/CurrentConditions.js src/components/components.test.js src/components/MobileSummary.js src/main.jsx src/styles.css shared/advice-engine.js shared/advice-engine.test.js
git commit -m "fix: show usable weather fallback states"
```

### 任务 4：全量验证、部署与推送

**文件：**
- 修改：`docs/superpowers/plans/2026-07-16-weather-resilience.md`

- [x] **步骤 1：运行全量测试**

```bash
npm test
```

预期：全部测试通过。

- [x] **步骤 2：运行生产构建与格式检查**

```bash
npm run build
git diff --check
```

预期：Vite 构建成功；格式检查无输出。

- [x] **步骤 3：部署到服务器**

将最新 `main` 发布到新的 `/opt/weather-pro/releases/<timestamp>-<commit>`，复用 `/opt/weather-pro/shared/.env`，切换 `/opt/weather-pro/current` 后重启 `weather-pro`，不要改动 Nginx 和证书配置。

- [x] **步骤 4：线上故障场景验证**

正常验证：

```bash
curl -fsS https://43.129.249.56/api/health
curl -fsS 'https://43.129.249.56/api/weather?location=101010100'
```

浏览器验证：首页不出现 `0°`、裸温度单位或空湿度/能见度，正常数据仍显示。

- [x] **步骤 5：更新计划并提交**

只勾选已经完成且有命令证据的步骤：

```bash
git add docs/superpowers/plans/2026-07-16-weather-resilience.md
git commit -m "docs: complete weather resilience plan"
```

- [x] **步骤 6：推送 main**

```bash
git push origin main
```

预期：本地 `HEAD` 与 `origin/main` 一致。
