# GitHub Pages 部署

仓库内 `.github/workflows/pages.yml` 在 `main` 分支更新或手工触发时执行 `npm ci`、测试、类型检查、构建和产物验证，随后上传 `dist` 并由 GitHub Pages 发布。工作流只授予读取代码、写 Pages 与签发部署身份所需权限。

首次发布前，仓库管理员需要在 GitHub 仓库 **Settings → Pages → Build and deployment** 中把 Source 设为 **GitHub Actions**。此设置不能由工作流的 `GITHUB_TOKEN` 代为启用。之后推送到 `main`，在 Actions 中确认 `Deploy demo to GitHub Pages` 成功，再访问仓库 Pages 地址。

本项目采用 Hash 路由和 Vite 相对资源基址，适用于 GitHub 项目子路径。部署产物仍是纯静态本地模拟：没有 Supabase、数据库、密钥或线上 Ozon/云仓端点。若迁移到生产环境，应先增加后端授权及 Ozon、云仓 adapter，再通过密钥管理服务配置凭据。

本地复现发布门禁：

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run verify
```

## Cloudflare Pages 与公开指南

生产项目：`ozon-cloud-warehouse`，地址 https://ozon-cloud-warehouse.pages.dev/ 。静态产物目录仍为 `dist`，不部署 `server/`，不配置真实业务凭据。

- 工作台：`/`（原 Hash 路由保持不变）
- 原创操作指南：`/guides/`；四篇文章采用独立 HTML 地址，不依赖客户端渲染正文。
- 关于与反馈：`/about`；隐私与广告说明：`/privacy`。
- `npm run verify` 同时验证业务演示与全部 HTML 的站内链接、所有权标记和广告关闭状态。

从已通过本地门禁的提交发布到现有免费 Pages 项目：

```bash
wrangler whoami
wrangler pages deploy dist --project-name=ozon-cloud-warehouse --branch=main --commit-hash="$(git rev-parse HEAD)"
```

GitHub Actions 仍负责 GitHub Pages 的自动发布。本次没有为 Cloudflare 自动部署新建或复制长期令牌，不能把手工发布说成 Cloudflare Git 集成已经配置。

回退：Cloudflare 项目的 Deployments 中可将此前的生产部署 `bf503948-5f19-4067-9810-9b7032aeb301` 回滚为生产版本。Git 源码可通过正常 revert 撤销本次发布提交；无需强推或修改数据库。回退网页不会自动撤销 Google 已接收的审核申请。

广告准备文件只包含当前发布商的公开 Meta 与 ads.txt，不加载广告 SDK。真实广告应在站点获批、广告单元与适用同意机制准备完成后另行启用，不在操作按钮旁注入广告。
