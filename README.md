<p align="center">
  <img src="lightflux/assets/brand-mark.png" width="104" height="104" alt="LightFlux">
</p>

<h1 align="center">LightFlux · 流光</h1>

<p align="center">
  本地优先、面向人与 Agent 协作的桌面任务管理工具。
</p>

<p align="center">
  <a href="https://github.com/little1d/LightFlux/actions/workflows/server-ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/little1d/LightFlux/server-ci.yml?branch=main&style=flat-square&label=Server" alt="Server CI"></a>
  <a href="https://github.com/little1d/LightFlux/actions/workflows/cli-ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/little1d/LightFlux/cli-ci.yml?branch=main&style=flat-square&label=CLI" alt="CLI CI"></a>
  <img src="https://img.shields.io/badge/Expo-57-000020?style=flat-square&logo=expo" alt="Expo 57">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri" alt="Tauri 2">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111827?style=flat-square" alt="MIT License"></a>
</p>

LightFlux 把日常计划、项目、日历、倒数纪念日、历史统计和受控 AI
操作放进一个紧凑的工作界面。任务修改会先落到本地，网络与账户是同步和
协作能力的增强，而不是使用应用的前提。

这个仓库包含完整产品：桌面客户端、服务端、CLI、Agent Skill 和桌面安装包
发布流程。Expo Web 是 Tauri 桌面界面的构建基础，不作为独立主产品维护。

## 核心能力

- **本地优先**：本地模式无需账户，任务操作即时生效并持久化。
- **统一任务模型**：Today、Projects、Calendar、Completed、Milestones
  和 Trash 共用版本化数据与明确的状态边界。
- **富文本详情**：Tiptap 编辑器支持文本、列表、图片和代码块，并自动保存。
- **桌面体验**：Expo Web 与 Tauri 提供 macOS、Windows 桌面应用；
  Linux 为 best effort。
- **云端连续性**：Better Auth、PostgreSQL 与 revision CAS 支持登录、
  多设备同步和冲突恢复。
- **受控 AI**：数据变更遵循理解、消歧、预览、确认、执行、审计与撤销流程。
- **Agent 接入**：`cli/` 提供脚本化上下文，Agent Skill 通过开放的
  Skills CLI 安装到受支持的 Agent。

## 当前产品边界

| 能力 | 当前状态 |
| --- | --- |
| Workspace | 每个登录账户一个隐式 Personal Workspace；Team Workspace、成员、角色和切换尚未实现 |
| Project | 桌面端支持创建、重命名、排序、删除和任务移动；Inbox 是不可删除的保留 Project |
| CLI Project | 支持查询和选择默认 Project；创建、重命名、删除 Project 尚未开放 |
| CLI Task | 支持查询、指定日期创建、子任务层级、Project/Milestone 关联、富文本内容、完成、恢复、回收、评论、审计和撤销 |
| CLI Milestone | 支持查询、创建、更新、归档、恢复、回收及太阳历/农历规则 |
| 云同步 | 本地即时写入；桌面可见时约 15 秒内协调 CLI 变更，并在窗口重新聚焦时立即刷新 |
| Web | Expo Web UI 与 Tauri 共用并持续维护；公开托管 Web 客户端暂不作为独立发布面 |

当前同步使用 revision CAS、三方合并和短周期轮询，不是 WebSocket
实时推送。CLI 未指定 `--project` 时使用登录阶段保存的默认 Project；新账户
只有 Inbox 时会自动选择 Inbox。

## 仓库结构

```text
LightFlux/
├── lightflux/             Expo Web 界面与 Tauri 桌面客户端
│   ├── editor-web/        共享 Tiptap 编辑器
│   └── src-tauri/         Tauri 桌面外壳
├── server/                认证、同步、上传与 AI 代理服务
├── cli/                   LightFlux CLI
├── skills/lightflux/      canonical Agent Skill
├── deploy/                Docker、Nginx 与部署脚本
├── docs/                  架构和发布文档
├── .devcontainer/         可复现的整仓开发环境
├── docker-compose.yml     开发工作区与本地 PostgreSQL
└── .github/workflows/     客户端、服务端、CLI 与发布自动化
```

## 快速开始

需要 Node.js 22。桌面开发还需要 Rust stable。

### Dev Container

在支持 Dev Containers 的编辑器中打开仓库并选择 `Reopen in Container`。
首次创建会安装三个 Node.js 工作区的依赖，并迁移本地 PostgreSQL。进入容器后：

```bash
npm --prefix server run dev
npm --prefix lightflux run web
```

数据库和 `node_modules` 使用 Docker 卷，不会写入宿主机。端口默认只监听
`127.0.0.1`。Tauri GUI 仍在宿主机运行。

### 客户端

```bash
git clone https://github.com/little1d/LightFlux.git
cd LightFlux/lightflux
npm ci
npm run editor:build
npm run web
```

常用命令：

```bash
npm start                 # Expo 开发服务器
npm run desktop:web       # 桌面端使用的静态 Web 资源
npx tauri dev             # Tauri 桌面开发
npx tauri build           # 桌面安装包
```

未启动服务端时，可以在登录页进入本地模式。

### 服务端

服务端需要 PostgreSQL 15+：

```bash
cd server
cp .env.example .env
npm ci
npm run db:migrate
npm run dev
```

也可以使用 `docker compose up --build` 启动本地 PostgreSQL 与 API。配置、
迁移和邮件登录说明见 [server/README.md](server/README.md)。

### CLI

```bash
cd cli
npm ci
npm link
lightflux --help
npm run check
```

CLI 提供桌面设备码授权、Workspace/Project 查询、子任务、Milestone、
富文本任务内容和审计撤销。Agent Skill 使用标准的 `npx skills add` 独立安装，详见
[cli/README.md](cli/README.md)。

```bash
npx skills@latest add little1d/LightFlux --skill lightflux --global
```

一键安装当前公开版本的 CLI 与 Skill：

```bash
curl -fsSL https://raw.githubusercontent.com/little1d/LightFlux/main/cli/scripts/install.sh | bash
```

## 环境配置

客户端通过构建时变量连接服务端：

```bash
EXPO_PUBLIC_AUTH_API_URL=http://localhost:8787
EXPO_PUBLIC_UPLOAD_API_URL=http://localhost:8787
EXPO_PUBLIC_AI_API_URL=http://localhost:8787
```

将 `lightflux/.env.example` 和 `server/.env.example` 复制为本地 `.env`
后再填写实际值。`.env`、签名私钥、数据库凭据和部署密钥均不得提交。
开发与生产环境必须使用独立数据库、密钥和 API 地址。

## 架构约束

- 当前持久化格式为严格 V12，只接受 `projects/projectId` 数据。
- 每个任务都属于一个 Project；保留的 Inbox Project 不可删除。
- 历史统计来自 `TaskEvent`，不从当前任务快照反推。
- 云写入使用服务端 revision compare-and-swap，冲突由客户端三方合并。
- AI 模型不能直接修改本地数据，所有变更必须经过预览和确认。

更多设计说明：

- [PostgreSQL 与同步架构](docs/backend-postgresql.md)
- [桌面发布与自动更新](docs/desktop-release.md)
- [CLI 与 Workspace API 边界](cli/docs/architecture.md)
- [部署说明](deploy/README.md)

## 验证

```bash
cd lightflux && npm test
cd lightflux && npm run typecheck
cd lightflux && npm run desktop:web
cd server && npm test
cd cli && npm run check && npm pack --dry-run
cargo check --manifest-path lightflux/src-tauri/Cargo.toml
```

## 发布

桌面版本统一发布在
[LightFlux Releases](https://github.com/little1d/LightFlux/releases)。
推送 `desktop-v*` 标签会构建 macOS、Windows 和 Linux 安装包，并生成
Tauri 自动更新所需的签名与 `latest.json`。

iOS、Android 与微信平台已冻结，不属于当前维护范围。桌面安装包目前可能触发
Gatekeeper 或 SmartScreen 提示，正式分发前仍需配置平台代码签名。

## 参与贡献

欢迎通过 Issue 描述问题或提案，并通过 Pull Request 提交聚焦、可验证的
改动。提交前请运行与改动范围对应的检查，并避免提交本地数据、环境变量或
构建产物。

## License

[MIT](LICENSE)
