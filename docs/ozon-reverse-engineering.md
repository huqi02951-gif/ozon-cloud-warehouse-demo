# Ozon 平台对接分析与云仓闭环设计

## 结论先行

- **订单、商品、库存、价格、退货都应走 Ozon 官方 Seller API**（`api-seller.ozon.ru`，请求头 `Client-Id` + `Api-Key`，在卖家后台“设置 → API 密钥”生成）。官方 API 已覆盖这次需要的全部能力，并且稳定、合规。
- **不要爬 seller.ozon.ru 的卖家后台网页**。该站点有反爬保护（本次访问 docs.ozon.ru 就遇到了 `?__rr=` 跳转循环），后台页面接口没有公开文档、随时会变，绕过保护还违反 Ozon 卖家协议，可能导致封店。
- **“实时数据”的正确做法**：Ozon Push 通知（webhook）加上定时轮询兜底，云仓回传走 webhook，服务端统一用 SSE 推给前端。

## 本次核查的内容

| 对象 | 方法 | 结论 |
| --- | --- | --- |
| 已部署演示 `daisyhu668.github.io/ozon-cloud-warehouse-demo` | 下载打包产物；用 REA `analyze_javascript_application` 做静态分析（281 KB 的包耗尽了分析器内存，覆盖不完整），再用 grep 补查 | 没有对外网络请求（仅 React 内部用到 `fetch`），只有 `localStorage` 持久化和 `source:"mock"` 适配器；与仓库源码一致 |
| `api-seller.ozon.ru` | 不带凭据直接请求 | 返回 401，说明需要 Client-Id/Api-Key，属预期 |
| `docs.ozon.ru/api/seller` | curl | 307 反爬跳转，本次无法逐字核对文档；`src/integrations/ozonContract.ts` 中的端点版本号接入前必须用真实账号校验 |

## 能力映射：Ozon API ↔ 中台模块

| 中台模块 | Ozon 端点 | 方向 |
| --- | --- | --- |
| 拉订单 | `/v3/posting/fbs/unfulfilled/list`、`/v3/posting/fbs/get`，以及 Push `TYPE_NEW_POSTING` | Ozon → 中台 |
| 取消 / 截单变化 | Push `TYPE_POSTING_CANCELLED`、`TYPE_CUTOFF_DATE_CHANGED` | Ozon → 中台 |
| 面单 | `/v2/posting/fbs/package-label` | Ozon → 中台 → 云仓 |
| 出库回写（FBS） | `/v4/posting/fbs/ship`（按包裹拆分） | 中台 → Ozon |
| 运单回写（rFBS） | `/v2/fbs/posting/tracking-number/set`、`/v2/fbs/posting/delivering` | 中台 → Ozon |
| 商品 | `/v3/product/list`、`/v3/product/info/list` | Ozon → 中台 |
| 库存 | `/v4/product/info/stocks` 读，`/v2/products/stocks` 写（按 Ozon warehouse_id） | 双向 |
| 价格 | `/v5/product/info/prices` 读，`/v1/product/import/prices` 写 | 双向 |
| rFBS 退货 | `/v2/returns/rfbs/list | get | verify | reject | receive-return` | 双向 |

## 云仓闭环（本次新增）

```
Ozon ──(Push/轮询)──▶ 服务端 ──SSE──▶ 前端「实时履约」
                       │  ▲
          下发出库单 ───┘  └── 云仓 webhook：accepted → picked → weighed → packed → waybill → shipped / rejected
                       │
                       └──▶ Ozon /v4/posting/fbs/ship 或 tracking-number/set ──▶ 订单完成
```

关键规则（已在 reducer 中实现，并有测试覆盖）：

1. 云仓回传按 `eventId` 幂等，重复推送不会重复扣库存。
2. 乱序容忍：状态只会前进；收到 `shipped` 后再收到 `picked`，只记录，不回退。
3. 只接受当前指派云仓的回传。
4. `shipped` 时结算预占库存，订单进入“待同步 Ozon”；回写成功后订单完成，回写失败生成可重试的异常任务（同一订单只有一条回写任务）。
5. `rejected` 时订单转为异常，出库任务标记为 `warehouse-refused`，提示人工改仓。

## 云仓回传协议

`POST /webhooks/warehouse`，请求头 `X-Signature: sha256=<HMAC-SHA256(body, WAREHOUSE_WEBHOOK_SECRET)>`

```json
{ "eventId": "wms-8812", "type": "waybill", "orderId": "order-normal", "warehouseId": "wh-moscow",
  "occurredAt": "2026-09-07T10:05:00+03:00",
  "package": { "packageNo": "P1", "weightGrams": 1250, "waybillNo": "RU123", "carrier": "СДЭК",
               "items": [{ "ozonSku": "OZ-DEMO-0001", "quantity": 2 }] } }
```

## 尚未完成

- 服务端拉到的 Ozon posting 目前只广播为 `ozon-posting` 事件，前端还没有把它映射成 Order（需要先确定 SKU 映射与店铺 ID 的对应关系）。
- 服务端没有持久化（幂等表在内存中），生产环境需要换成数据库或 Redis，并加入队列和重试。
- 前端“回写 Ozon”按钮在演示模式下是模拟的；接入服务端后应改为调用 `/api/ozon/ship`。
