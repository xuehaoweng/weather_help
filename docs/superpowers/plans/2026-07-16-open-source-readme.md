# Weather Pro 开源 README 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 README 改造成突出成品天气助手价值、可三步启动并能促进 Star 与贡献的开源项目首页。

**架构：** 中文 README 承担产品落地页和开发入口两项职责，先呈现用户收益与真实界面，再提供运行、数据源、部署和贡献信息。英文 README 保持独立入口，产品截图保存为仓库静态资产并由两个 README 复用。

**技术栈：** Markdown、React 19、Vite 6、Express 4、Node.js test runner、Docker Compose

---

## 文件结构

- 创建：`public/weather-pro-preview.png`，保存当前 Mock 模式下的真实产品界面截图。
- 修改：`README.md`，作为中文产品型项目首页和完整上手指南。
- 修改：`README.en.md`，同步核心定位、截图和快速启动入口。

### 任务 1：生成真实产品预览图

- [ ] **步骤 1：启动 Mock 模式开发服务**

运行：`npm run dev:mock`

预期：API 监听 `8787`，Vite 页面监听 `5177`。

- [ ] **步骤 2：在浏览器打开产品并保存截图**

打开：`http://127.0.0.1:5177/`

保存：`public/weather-pro-preview.png`

预期：截图来自当前代码，包含天气概览和主要决策信息，不含开发者工具或敏感凭据。

- [ ] **步骤 3：检查截图文件**

运行：`file public/weather-pro-preview.png`

预期：输出显示有效 PNG 图片。

### 任务 2：重写产品型 README

- [ ] **步骤 1：重写中文 README 首屏与正文**

修改 `README.md`，依次包含：语言入口、可验证徽章、产品价值主张、Star 行动提示、真实截图、核心能力、三步快速启动、真实数据配置、Docker、架构、脚本、项目结构、Roadmap、贡献、安全和 License。

快速启动必须使用：

```bash
git clone git@github.com:xuehaoweng/weather_help.git
cd weather_help
npm install
cp .env.example .env
npm run dev
```

并明确默认 Mock 模式无需和风天气账号，访问地址为 `http://localhost:5177/`。

- [ ] **步骤 2：同步英文 README 核心信息**

修改 `README.en.md`，至少包含中文入口、价值主张、真实截图、核心功能、快速启动、真实数据配置、Docker、贡献和 License，确保中英文命令一致。

- [ ] **步骤 3：检查文档事实一致性**

对照 `package.json`、`.env.example`、`vite.config.js`、`server/index.js` 和现有文档，确认脚本名、环境变量、端口、路径和功能描述准确。

### 任务 3：验证并提交

- [ ] **步骤 1：运行自动化测试**

运行：`npm test`

预期：全部 Node.js 测试通过。

- [ ] **步骤 2：运行生产构建**

运行：`npm run build`

预期：Vite 构建成功并生成 `dist/`。

- [ ] **步骤 3：检查 Markdown 与变更内容**

运行：`git diff --check`

预期：无空白错误；README 中所有相对链接均对应仓库内现有文件。

- [ ] **步骤 4：提交 README 改造**

```bash
git add README.md README.en.md public/weather-pro-preview.png docs/superpowers/plans/2026-07-16-open-source-readme.md
git commit -m "docs: make readme showcase Weather Pro"
```

- [ ] **步骤 5：配置目标远程并推送**

```bash
git remote add origin git@github.com:xuehaoweng/weather_help.git
git push -u origin main
```

预期：本地 `main` 成功推送并跟踪目标仓库的 `main`。
