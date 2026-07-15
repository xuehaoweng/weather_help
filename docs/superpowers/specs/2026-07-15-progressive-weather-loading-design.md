# Weather Pro 渐进式天气加载设计

## 目标

当前 `/api/weather` 并行请求六个和风接口，并等待最慢的生活指数后才返回。实测指定城市冷请求约 3.09 秒，缓存命中约 2.8 毫秒；生活指数约 2.94 秒，分钟降雨约 2.17 秒。

本次优化目标：

- 核心天气冷请求在实时、预报和预警准备好后立即返回，目标约 1.8–2 秒。
- 分钟降雨和生活指数异步补齐，不阻塞天气动画、实时天气和预报。
- 新城市、服务重启和并发请求均有稳定性能。
- 详情失败或超时不导致整页天气失败。

本次变更已确认允许调整默认接口契约：应用内调用迁移到两阶段加载；外部调用方若仍需要单次完整响应，应显式使用 `full=true`。这是一条迁移通道，不宣称默认响应向后兼容。

## API 设计

### `GET /api/weather`

默认只聚合：

- 实时天气 `/v7/weather/now`
- 7 天预报 `/v7/weather/7d`
- 24 小时预报 `/v7/weather/24h`
- 当前预警 `/v7/warning/now`

响应保留现有顶层结构，但 `minutely` 和 `indices` 不再出现。`errors` 仅包含核心接口错误。`insight` 使用实时降水计算基础出门评分和当前天气标题。

`?full=true` 保留旧的完整聚合行为：等待六个上游接口、返回 `minutely` 和 `indices`，并使用分钟降雨参与旧版完整 `insight` 的评分、标题和降雨字段计算，供需要一次获取全部数据的调用方迁移使用。

### `GET /api/weather/details`

参数与核心接口相同，聚合：

- 分钟降雨 `/v7/minutely/5m`
- 生活指数 `/v7/indices/1d`

返回：

```json
{
  "location": "101200204",
  "point": "111.84,31.78",
  "minutely": {},
  "indices": {},
  "insight": {
    "rainSummary": "未来两小时暂无明显降水",
    "firstRainAt": null,
    "maxPrecip": 0
  },
  "errors": []
}
```

Mock 模式提供相同的核心、详情和 `full=true` 语义。

### HTTP 与错误契约

三个模式都使用固定的逐上游错误结构：

```json
{
  "source": "indices",
  "code": "UPSTREAM_TIMEOUT",
  "message": "Weather details are temporarily unavailable"
}
```

`source` 取 `now`、`daily`、`hourly`、`warning`、`minutely` 或 `indices`；`code` 至少区分 `UPSTREAM_TIMEOUT`、`UPSTREAM_HTTP_ERROR`、`UPSTREAM_INVALID_RESPONSE` 和 `UPSTREAM_NETWORK_ERROR`。`message` 不暴露 API Key、完整上游 URL 或内部堆栈。

- 所请求分组至少一项成功：返回 HTTP 200；失败项字段为 `null`，成功项正常返回，`errors` 列出失败项。
- 核心四项全部失败：返回 HTTP 502，错误体包含 `error: { "code": "CORE_WEATHER_UNAVAILABLE", "message": "Weather data is temporarily unavailable" }`、四个数据字段的 `null` 和逐项 `errors`。
- 详情两项全部失败：返回 HTTP 502，错误体包含 `error.code = "WEATHER_DETAILS_UNAVAILABLE"`、`minutely: null`、`indices: null` 和逐项 `errors`；前端只进入详情局部错误态。
- `full=true` 六项全部失败：返回 HTTP 502，`error.code = "WEATHER_DATA_UNAVAILABLE"`，六个数据字段均为 `null`。部分成功仍为 HTTP 200。
- 参数非法：返回 HTTP 400 和 `error.code = "INVALID_LOCATION"`。经纬度必须成对出现、为有限数字且分别处于 `[-180, 180]` 与 `[-90, 90]`；两者都缺失时允许仅使用 `location`。

## 前端数据流

`createLatestWeatherLoader` 在每次切换城市时同时发出核心和详情请求，并共享同一代请求标识与取消控制器。每份结果都携带内部 `generation` 与规范化 `locationKey`；只有两者都匹配当前选择时才能进入当前状态。

核心状态：

- `loading`：整页首屏骨架。
- `success`：立即展示实时天气、动态天气场景、7 天和 24 小时预报。
- `error`：显示现有整页天气错误卡片。

详情状态：

- `loading`：降雨时间线和依赖生活指数的场景建议保持局部骨架；天气卡降雨事实显示“分析中”。
- `success`：无刷新补齐分钟降雨、生活指数和降雨洞察。
- `error`：核心页面继续可用；相关区域显示局部“详情暂不可用”，不覆盖核心天气错误。

核心与详情分别存储，渲染时合并 `insight`。切换城市立即隔离旧城市的 core/details，并将新一代详情重置为 loading。若新城市 details 先返回，只暂存在该代的 details 槽位；必须等同代 core 成功后才允许合并和展示，绝不能与上一代 core 合并。若同代 core 失败，已到达的 details 不单独展示。

旧城市请求的成功、失败、超时和 finally 分支均不得写入新城市状态；`AbortError` 保持静默。测试必须覆盖“已有 A 数据 → 切到 B → B details 先于 B core 返回”。

## 上游客户端与缓存

将和风请求与缓存从 `server/index.js` 提取到 `server/qweather-client.js`：

- 内存缓存保留现有各接口 TTL。
- 新增进行中请求 Map；相同 URL 并发调用共享同一个 Promise，避免重复请求。Promise 在成功、失败和超时后都在 `finally` 清理；仅当 Map 仍指向该 Promise 时删除，避免旧请求清掉新请求。
- 新增磁盘缓存 `.cache/qweather.json`，启动时加载未损坏的数据，命中时仍按各接口 TTL 判断。
- 磁盘格式包含 `schemaVersion`、每项 `cachedAt` 与 payload；未知版本、时间戳非法或结构损坏时忽略。
- 上游成功后更新内存缓存，并用短延迟合并多次磁盘写入。持久化采用单写者串行队列：同一时刻最多一个 flush；写入期间的新更新标记 dirty/version，当前写入完成后必须以最新快照再写一次。每次使用唯一临时文件并原子 rename，防止半写和旧快照后写覆盖新快照。
- 缓存键仅包含上游 URL，不包含 API Key。
- 损坏、缺失或不可写的磁盘缓存只降级为内存缓存，不阻止服务启动和请求。
- `.cache/` 加入 `.gitignore`。
- 客户端暴露 `close()`；服务在 SIGTERM/SIGINT 停止接收新请求后等待最后一次 dirty flush 再退出。强制退出不承诺落盘，但原子 rename 保证已有缓存文件可读。

每个上游请求默认设置 4 秒完整操作超时，可通过正有限整数 `QWEATHER_TIMEOUT_MS` 调整；缺失、非数字、零或负数都回退到 4000ms。计时覆盖建立连接、读取完整响应体和 JSON 解析，使用 AbortController，并在成功或失败的 `finally` 中清理定时器。超时统一转换为 `UPSTREAM_TIMEOUT`；超时后 inflight 条目必须清除，下一次调用会重新 fetch。超时错误进入对应 payload 的 `errors`；由于聚合使用 `Promise.allSettled`，其他成功数据仍正常返回。

## 洞察兼容

核心 `insight` 根据实时天气、预警、当天预报和 `now.precip` 生成；它不等待未来两小时降雨。详情 `insight` 只补充：

- `rainSummary`
- `firstRainAt`
- `maxPrecip`

前端合并两者。这样首屏标题和评分稳定，未来降雨信息在详情完成后出现，不会先错误显示“两小时内暂无”。

## 错误和边界

- 核心接口四项全部失败：按上述 HTTP 502 契约返回，前端显示整页错误。
- 核心部分失败：返回可用字段和 `errors`，前端按现有可选字段策略展示。
- 详情一项或两项失败：返回另一项及 `errors`；只有详情全部不可用时显示局部错误。
- 经纬度非法、越界、只提供一项：返回 HTTP 400；两者均缺失时沿用 location；不得生成 `NaN,NaN` 上游 URL。
- 磁盘缓存不能覆盖更新的数据，也不能把过期条目作为新鲜数据返回。

## 可测试架构

- `createQWeatherClient` 注入 `fetch`、clock、timers、filesystem/cache path 与 timeout，生产环境再绑定全局实现。
- `createWeatherApp` 注入 weather client 和 mock provider；模块导入不监听端口，`listen` 只存在于启动入口。
- 持久化 writer 可注入 rename/write 延迟，以确定性测试写入期间更新和乱序风险。
- 前端 loader 注入 request 函数，测试可独立控制 core/details 的完成顺序。

## 测试与验收

自动化测试：

1. 核心接口只等待四项，详情接口只等待两项，`full=true` 返回六项。
2. 前端核心响应先更新 UI，详情响应后独立补齐。
3. 详情失败不清空核心数据；城市切换拒绝两阶段旧响应。
4. 上游超时成为局部错误，不挂死请求。
5. 相同 URL 并发只调用一次 `fetch`，多个等待者收到同一结果；失败/超时后再次调用会重新 fetch。
6. 超时覆盖响应体挂起，定时器被清理，非法 timeout 配置回退 4000ms。
7. 磁盘缓存可跨客户端实例恢复；损坏/未知 schema 安全降级；过期数据不命中；写入期间的新更新最终以最新版本落盘。
8. 覆盖 core/details/full 的全失败与部分失败状态码和字段，以及缺失、非法、越界、单边经纬度。
9. 覆盖“已有 A → 切换 B → B details 先返回”，任何时刻都不混合两个城市。

运行时验收：

- 同一网络环境清空缓存后各测 3 次中位数：核心接口不高于 2.5 秒，或至少比 `full=true` 快 20%；详情不阻塞核心渲染。
- 第二次请求中位数低于 50ms，验证内存缓存命中；重启后有效磁盘缓存也低于 100ms。
- 真实浏览器确认核心先显示，详情局部骨架随后消失。
- 控制台无错误，快速切换城市不出现旧数据闪回。
