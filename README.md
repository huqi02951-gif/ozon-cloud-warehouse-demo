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

## 演示范围

已实现 12 个有业务内容的页面：运营工作台、订单中心、出库履约、面单中心、商品中心、库存中心、价格管理、rFBS 退货、云仓管理、SKU 映射、异常与日志、系统设置。支持全局店铺/云仓筛选、管理员/运营人员/仓库人员三种角色、订单路由下发、模拟面单、库存和价格操作、退货闭环、SKU 修复重试、设置保存与确认重置。刷新后状态保存在当前浏览器 `localStorage`。

商品创建和图片上传、订单部分取消、真实账号授权、真实物流打印与外部同步尚未实现。演示中的商品图形为渐变与首字母，不是商品照片。详见 [演示指南](docs/demo-guide.md)、[需求边界](docs/requirements.md)、[架构说明](docs/architecture.md) 与 [部署说明](docs/deployment.md)。
