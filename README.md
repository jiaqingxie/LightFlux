# LightFlux · 流光

纯本地桌面任务工具。无需账号、网络或自建服务器，打开即可使用。

## 能力

- 任务、子任务、Project、日历、完成列表和回收站。
- Milestone：公历、农历、纪念日和提醒。
- 富文本详情与本地图片，历史统计基于 TaskEvent。
- 自动本地备份、手动导出和恢复。
- CLI 与外部 Agent 通过本机桌面接口操作数据，支持版本校验、幂等、审计和撤销。

macOS 为首选，Windows 次之，Linux 为 best effort。Expo Web 仅作为
Tauri 的共享界面及开发预览，不再部署公开网页产品。iOS、Android、微信、
账号、云同步和内置云 AI 均不属于维护范围。

## 开发

需要 Node.js 22+、Rust stable 和平台 Tauri 构建依赖。

```bash
npm --prefix shared ci
npm --prefix lightflux ci
cd lightflux
npx tauri dev
```

```bash
npm run web              # 共享界面预览，无需服务端
npm run desktop:web      # 纯本地静态资源，忽略旧云端环境配置
npx tauri build          # 桌面安装包
```

可选 Dev Container 仅启动开发工作区，不再自动启动或迁移数据库。

## CLI 与 Agent

安装同一 checkout 的 CLI；桌面端未运行时 CLI 会自动启动它：

```bash
npm --prefix cli ci
npm --prefix cli link
lightflux context --json
lightflux projects --json
lightflux project create "工作计划" --color '#8B7EFF'
lightflux task create "整理计划" --date 2026-09-12 --content "本地备注"
```

不需要 `login`。运行 `lightflux` 可选择默认 Project；未选择时使用保留的
Inbox。CLI 不直接修改数据文件；`LIGHTFLUX_NO_AUTOSTART=1`（或 CI 环境）
可关闭自动启动。删除 Project 会把其下任务回收至 Inbox，Inbox 本身不可改删。

```bash
npx skills@latest add ./ --skill lightflux --global
```

详见 [CLI 文档](cli/README.md) 和 [本地架构](docs/local-desktop.md)。
公开仓库安装命令仅在这些变更发布后提供同样的本地能力，旧安装包不会自动变成本地版。

## 数据与迁移

首次启动会将当前 WebView 的 V12 数据迁移到桌面应用数据目录，
原 IndexedDB 数据保留。损坏或不支持的数据不会被当成空数据覆盖。
当前文件为 `local-state-v12.json`，`backups/` 保留最近 30 次变化前的快照。
通过设置导出 JSON 备份，可在其他设备上手动恢复。

**只存在云端、尚未同步到这台设备的数据不会自动下载。** 旧服务器与数据未删除；
停服前必须另行导出、核对任务及附件。旧任务的远程图片链接不会自动变成本地文件，
需要重新导入图片。新插入的图片嵌入任务内容，随备份一起保存。

## 仓库

| 路径 | 用途 |
| --- | --- |
| `lightflux/` | 共享界面与 Tauri 桌面 |
| `shared/` | 不依赖网络、数据库的任务、Project 和 Milestone 规则 |
| `cli/` | 本机 CLI |
| `skills/lightflux/` | Agent Skill |
| `server/`, `deploy/` | 归档的云服务与恢复工具，不是桌面运行依赖 |

## 验证与发布

```bash
npm --prefix lightflux test
npm --prefix lightflux run typecheck
npm --prefix lightflux run desktop:web
npm --prefix cli run check
cargo test --manifest-path lightflux/src-tauri/Cargo.toml
```

桌面安装包发布到 [GitHub Releases](https://github.com/little1d/LightFlux/releases)。
检查更新是手动操作，离线使用不受影响。云服务自动部署已停止。

[MIT License](LICENSE)
