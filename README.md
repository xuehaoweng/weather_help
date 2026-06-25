# Weather Pro

开源出门天气助手。基于和风天气 API，聚合实时天气、分钟级降雨、天气预警、生活指数和通勤/户外/家庭场景建议，帮助用户在出门前快速做决定。

## Features

- 实时天气、体感温度、湿度、风速、能见度
- 未来 2 小时分钟级降雨展示
- 无雨状态、加载骨架屏和移动端适配
- 7 天预报、24 小时预报
- 天气预警和生活指数
- 城市/区县搜索
- 通勤、户外、家庭三种出门场景
- 服务端代理和风天气 API，避免 API KEY 暴露到前端
- Mock 模式，新用户无需申请 Key 也能立即跑起来
- Docker 部署支持

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

默认 `.env.example` 使用 `QWEATHER_MOCK=true`，可以直接打开：

```text
http://localhost:5177/
```

局域网访问时使用 Vite 打印出的 Network 地址，例如：

```text
http://10.254.0.231:5177/
```

## Use QWeather Data

1. 访问和风天气开发平台并创建项目与凭据：https://dev.qweather.com/
2. 编辑 `.env`：

```bash
QWEATHER_MOCK=false
QWEATHER_PROJECT_ID=your_project_id
QWEATHER_CREDENTIAL_ID=your_credential_id
QWEATHER_API_KEY=your_api_key
QWEATHER_API_HOST=devapi.qweather.com
QWEATHER_GEO_HOST=geoapi.qweather.com
PORT=8787
```

3. 重新启动：

```bash
npm run dev
```

生产环境建议使用和风天气的专属 API Host、访问限制和 JWT 认证。API KEY 不要写进前端代码，也不要提交 `.env`。

## Scripts

```bash
npm run dev       # 启动 API + Web 开发服务
npm run dev:mock  # 强制使用 Mock 数据
npm run build     # 构建前端
npm run start     # 生产模式启动 Express，托管 dist
```

## Docker

```bash
cp .env.example .env
docker compose up --build
```

访问：

```text
http://localhost:8787/
```

## Architecture

```text
React + Vite 前端
        |
        | /api/*
        v
Express API 代理
        |
        | X-QW-Api-Key
        v
QWeather API
```

前端只访问本项目的 `/api/*`，真实的和风天气凭据只存在服务端环境变量里。

## Project Structure

```text
server/
  index.js        # API 代理、缓存、天气洞察计算
  mock-data.js    # 无 Key 试用数据
src/
  main.jsx        # React 应用
  styles.css      # UI 样式
docs/
  deployment.md
  qweather-setup.md
```

## Roadmap

查看 [ROADMAP.md](./ROADMAP.md)。

## License

MIT
