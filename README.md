<div align="center">

# Weather Pro

### 不止告诉你天气，更直接告诉你今天该怎么出门

聚合实时天气、分钟级降雨、天气预警和生活指数，为通勤、户外与家庭场景生成清晰的出门建议。

[English](./README.en.md) · [快速开始](#-快速开始) · [部署指南](./docs/deployment.md) · [参与贡献](./CONTRIBUTING.md)

[![CI](https://github.com/xuehaoweng/weather_help/actions/workflows/ci.yml/badge.svg)](https://github.com/xuehaoweng/weather_help/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6659.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-43853d.svg)](https://nodejs.org/)
[![GitHub stars](https://img.shields.io/github/stars/xuehaoweng/weather_help?style=social)](https://github.com/xuehaoweng/weather_help/stargazers)

如果 Weather Pro 对你有帮助，欢迎点一个 Star，让更多人发现它。

</div>

![Weather Pro 产品界面](./public/weather-pro-preview.png)

## 为什么是 Weather Pro？

普通天气应用给你一堆数字，Weather Pro 试着回答更重要的问题：**要不要带伞？穿什么？什么时候出门？今天适合跑步、骑行或带家人外出吗？**

- **一眼做决定**：把体感温度、降雨、风速、预警和生活指数转成可执行建议
- **关注接下来两小时**：分钟级降雨趋势，出门前快速判断是否需要带伞
- **真正不同的场景建议**：通勤看出发与雨具，户外看活动窗口，家庭看老人儿童与穿衣防晒
- **本机雨前提醒**：可设置地点、提前量和生效时段，页面打开期间自动检查降雨
- **常用地点与当前位置**：一键定位，并在本机保存最多 5 个常用地点
- **评分有依据**：查看基础分、天气扣分项、数据来源和更新时间
- **免费即可体验**：默认 Mock 模式，不注册账号、不填写 API Key 也能完整运行
- **凭据留在服务端**：浏览器只访问项目 API，避免将和风天气 Key 暴露到前端
- **部署方式简单**：支持本地运行、生产构建与 Docker Compose

## 🚀 快速开始

推荐使用 Node.js 20 或更高版本。

```bash
git clone git@github.com:xuehaoweng/weather_help.git
cd weather_help
npm install
cp .env.example .env
npm run dev
```

打开 [http://localhost:5177](http://localhost:5177)。默认配置已启用 Mock 数据，无需申请和风天气账号。

想更快？已经安装依赖时，直接运行：

```bash
npm run dev:mock
```

## 你能看到什么

| 能力 | 帮你解决的问题 |
| --- | --- |
| 实时天气与体感温度 | 当前到底冷不冷、热不热 |
| 未来 2 小时分钟级降雨 | 现在出门要不要带伞 |
| 7 天与 24 小时预报 | 安排通勤、周末和户外活动 |
| 天气预警与生活指数 | 提前规避高温、雷雨等风险 |
| 城市与区县搜索 | 快速查看目的地天气 |
| 通勤 / 户外 / 家庭模式 | 获得不同的出发、活动和家庭建议 |
| 本机雨前提醒 | 在页面打开期间提前收到浏览器或页面提示 |
| 当前位置与常用地点 | 快速切换家、公司、学校等地点 |
| 可解释出门评分 | 看清降雨、大风、UV 等扣分因素 |
| 骨架屏与渐进加载 | 弱网环境下更快看到关键结论 |

## 本机雨前提醒

点击页面右上角“雨前提醒”，选择地点、提前 10/20/30 分钟和生效时段。只有在你主动点击“允许通知”后，Weather Pro 才会请求浏览器通知权限。

> [!NOTE]
> 当前是本机 MVP：页面打开期间会每 5 分钟检查一次降雨，页面重新可见时也会立即检查。关闭浏览器后无法保证提醒；后台 Web Push 和跨设备同步仍在 Roadmap 中。

## 使用真实天气数据

Weather Pro 使用[和风天气开发服务](https://dev.qweather.com/)。创建项目与凭据后，编辑本地 `.env`：

```bash
QWEATHER_MOCK=false
QWEATHER_PROJECT_ID=your_project_id
QWEATHER_CREDENTIAL_ID=your_credential_id
QWEATHER_API_KEY=your_api_key
QWEATHER_API_HOST=devapi.qweather.com
QWEATHER_GEO_HOST=geoapi.qweather.com
PORT=8787
```

重新运行 `npm run dev` 即可。更完整的说明见[和风天气配置指南](./docs/qweather-setup.md)。

> [!IMPORTANT]
> 不要提交 `.env`，也不要把 API Key 写进前端代码。公开部署时建议配置访问限制并使用和风天气专属 API Host 或 JWT 认证。

## Docker 部署

```bash
cp .env.example .env
docker compose up --build
```

打开 [http://localhost:8787](http://localhost:8787)。生产构建、环境变量和部署建议见[部署文档](./docs/deployment.md)。

## 工作原理

```text
React + Vite 前端
        │
        │  /api/*
        ▼
Express API 代理 ── 缓存 / 数据聚合 / 场景建议
        │
        │  服务端凭据
        ▼
QWeather API（或内置 Mock 数据）
```

前端只访问同源 `/api/*`。Express 负责请求和风天气、缓存数据并生成天气洞察，真实凭据始终保留在服务端。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时启动 API 与 Web 开发服务 |
| `npm run dev:mock` | 强制使用内置 Mock 数据 |
| `npm test` | 运行前后端单元测试 |
| `npm run build` | 构建生产版前端 |
| `npm run start` | 用 Express 托管生产构建与 API |

## 项目结构

```text
weather_help/
├── shared/                 # 前后端共用的场景建议与评分规则
├── src/                    # React 界面、天气效果与渐进加载
├── server/                 # Express API、天气服务、缓存与 Mock 数据
├── public/                 # 静态资源与产品截图
├── docs/                   # 配置和部署文档
├── .github/workflows/      # GitHub Actions CI
├── docker-compose.yml
└── vite.config.js
```

## Roadmap

接下来计划支持 PWA、后台 Web Push、跨设备同步、分享天气卡片和更多户外场景。查看完整 [Roadmap](./ROADMAP.md)，也欢迎通过 Issue 提议你最需要的能力。

## 参与贡献

Bug 修复、体验改进、新场景和文档优化都很欢迎：

1. Fork 本仓库并创建功能分支
2. 完成修改后运行 `npm test` 与 `npm run build`
3. 提交一个聚焦、说明清楚的 Pull Request

开始前请阅读[贡献指南](./CONTRIBUTING.md)。发现安全问题时，请按[安全策略](./SECURITY.md)私下报告，不要公开敏感细节。

## License

[MIT](./LICENSE) © Weather Pro contributors

<div align="center">

**让每一次出门，都少一点天气带来的意外。**

如果你喜欢这个项目，欢迎 [Star Weather Pro](https://github.com/xuehaoweng/weather_help)。

</div>
