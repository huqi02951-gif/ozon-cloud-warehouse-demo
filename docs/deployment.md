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
