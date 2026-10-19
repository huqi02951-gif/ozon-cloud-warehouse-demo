# Ozon 云仓运营中台演示

这是一个面向产品评审的中文前端演示，用虚构订单、商品、库存、仓库和退货数据串联 Ozon 店铺与云仓协同流程。所有接口、面单和业务结果均为本地模拟；项目不连接 Ozon、云仓或数据库，也不代表完整 Ozon 产品能力。

## 运行

需要 Node.js 22 与 npm。依赖版本和锁文件已固定。

```bash
npm ci
npm run dev
```

浏览器打开终端显示的地址。应用使用 Hash 路由，可从 `#/dashboard` 开始。发布前运行：

```bash
npm test
npm run typecheck
npm run build
npm run verify
```

## 实时履约与云仓闭环（新增）

新增「实时履约」页：接收云仓回传（拣货 → 称重 → 打包 → 运单 → 出库），再回写 Ozon 发货/运单，完成订单闭环。默认在浏览器内模拟回传；运行服务端并设置 `VITE_EVENTS_URL` 后，切换为真实 SSE 实时推送：

```bash
OZON_CLIENT_ID=... OZON_API_KEY=... WAREHOUSE_WEBHOOK_SECRET=... npm run server   # :8787
VITE_EVENTS_URL=http://localhost:8787/events npm run dev
```

对接方案与 Ozon API 映射见 [docs/ozon-reverse-engineering.md](docs/ozon-reverse-engineering.md)。凭据只放在服务端。

## 演示范围

已实现 13 个有业务内容的页面：运营工作台、实时履约、订单中心、出库履约、面单中心、商品中心、库存中心、价格管理、rFBS 退货、云仓管理、SKU 映射、异常与日志、系统设置。支持全局店铺/云仓筛选、管理员/运营人员/仓库人员三种角色、订单路由下发、模拟面单、库存和价格操作、退货闭环、SKU 修复重试、设置保存与确认重置。刷新后状态保存在当前浏览器 `localStorage`。

商品创建和图片上传、订单部分取消、真实账号授权、真实物流打印与外部同步尚未实现。演示中的商品图形为渐变与首字母，不是商品照片。详见 [演示指南](docs/demo-guide.md)、[需求边界](docs/requirements.md)、[架构说明](docs/architecture.md) 与 [部署说明](docs/deployment.md)。
