# Panta Terminal — 项目方案

> Colosseum Crypto World's Fair 2026 · Panta API Sidetrack + Solana 主赛道
> 截止提交：2026-10-12（剩约 16 天）· 结果公布：2026-10-27
> 制定日期：2026-09-26

---

## 1. 定位与差异化

**一句话**：Panta Terminal 是 Panta 预测市场的「TradingView」——为 Panta 全类目市场（sports 优先）提供它自己都没有的实时 K 线、价格历史、WebSocket 推送和聪明钱追踪，并支持终端内一键非托管下单。

**为什么能赢**：
- Panta API 有两个结构性缺口：**无历史价格接口、无实时推送**。Panta 官网连图表都没有。
- Rust 后端恰好是填补这两个缺口的最佳工具：高频轮询聚合、时序存储、WebSocket 扇出。
- 最强已知竞品 sonar-panta（Next.js，信号分析路线）做的是「该不该买」，我们做「看得更快更清楚」，互补而非同质。
- 侧赛道仅 5 个提交，做出完整可用产品 + 好 demo 的胜率极高。

**双赛道策略**：同一项目同时提交 Panta 侧赛道（$5,000）和 Colosseum 主赛道 Solana Track（$100,000 奖池 + 加速器面试机会），物料按主赛道标准做。

## 2. 产品形态

**目标用户**：crypto 原生的预测市场交易者（英文界面）。

### MVP 功能（必须做完）

| 模块 | 内容 |
| --- | --- |
| 行情雷达 | **全类目**市场列表（实测 sports 占绝对大头、crypto 较冷，故 sports 优先排序、crypto 保留常驻标签；另发现列表里存在 stocks/commodities 类目），按成交量/赔率变动/热度排序，实时刷新 |
| K 线终端 | 每个市场的 YES/NO 价格 K 线图（1m/5m/1h），数据由我们自己的快照层生成——**Panta 生态第一份价格历史** |
| 实时推送 | WebSocket 推送赔率变动、新成交、大单告警 |
| 非托管交易 | 终端内下单：quote → build → 钱包签名 → submit → verify（Panta API 四步流程），用户资金不经我们 |
| 聪明钱榜 | 按 PnL/胜率排名的钱包排行榜（从 `/wallets/{wallet}/trades/` 聚合），点击钱包看持仓与历史 |

### Stretch goals（进度超前才做）

- 大单/赔率突变 Telegram 或浏览器推送告警
- 自定义 Anchor 合约（跟单金库或预测组合凭证）——仅当第 2 周末进度超前才启动
- AI 辅助创建市场（对标 sonar 的 create flow）

## 3. 技术架构

```
┌─────────────────────────────────────────────────────────┐
│  前端：Next.js 15 + TypeScript + Tailwind               │
│  - @solana/wallet-adapter（Phantom 等钱包签名）          │
│  - lightweight-charts（TradingView 开源 K 线库）         │
│  - REST + WebSocket 连我们自己的 Rust 后端               │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Rust 后端：axum + tokio                                │
│  - panta-client crate：类型化 Panta API 封装             │
│    （令牌桶限速：读 100/60s、写 25/60s，429 退避重试）    │
│  - snapshotter：每 30s 全市场快照（category×status        │
│    扇出遍历，绕过官方 cursor 循环 bug）                  │
│  - OHLC 聚合器：快照 → 1m/5m/1h K 线                     │
│  - wallet-profiler：成交带 → 钱包 PnL/胜率               │
│  - WebSocket hub：赔率/成交/告警扇出                     │
│  - 存储：SQLite（MVP，sqlx）→ Postgres（有余力再迁）      │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Panta API          │
        │  live-api.panta.market/api/v1                   │
        │  X-Api-Key: pk_live_ / pk_test_（沙盒演示用）     │
        └─────────────────────┘
```

**交易安全边界**：API key 只存在于后端；所有链上交易由 Panta 构建指令、用户钱包在前端签名、后端代广播并回传归因（`/trades/`）。全程非托管。演示视频全程用 `pk_test_` 沙盒模式录制，零资金成本。

**Panta API 已知的坑**（来自 sonar-panta 源码与文档，提前规避）：
- 列表接口 cursor 分页会循环返回同一批数据 → 用 status × category 扇出遍历 + 去重
- 价格字段时而 "0.43" 时而 1e9 缩放整数 → 统一 `normPrice` 归一化
- 读限速 120 次/60s → 令牌桶 + 快照间隔 ≥ 30s
- P2P（secondary）市场不出现在列表接口 → 雷达只覆盖 reachable set，README 里说明

## 4. 16 天排期

| 阶段 | 日期 | 交付 |
| --- | --- | --- |
| **D0 前置（你的行动项）** | 9/26-27 | 注册 panta.market 账号，拿到 `pk_test_` + `pk_live_` key（**阻塞项，没有 key 一切免谈**） |
| **P1 骨架** | 9/27-9/30 | Rust panta-client crate（全部读接口 + 类型 + 限速）；axum 服务骨架；Next.js 脚手架 + 钱包连接 |
| **P2 数据层** | 10/1-10/4 | snapshotter + SQLite schema + OHLC 聚合 + wallet-profiler；后端 REST/WS API 冻结 |
| **P3 前端主体** | 10/5-10/8 | 行情雷达页、K 线终端页、聪明钱榜页、WebSocket 实时更新 |
| **P4 交易闭环** | 10/8-10/10 | 下单四步流程 + 沙盒模式开关 + 持仓/claim 页面 |
| **P5 提交冲刺** | 10/10-10/12 | 部署（Render/Fly.io + Vercel）、README、demo 视频（≤3min，沙盒录制）、pitch deck（主赛道）、双赛道提交 |

## 5. 提交物料清单

**Panta 侧赛道 / 主赛道通用**：
- [ ] GitHub 仓库（开源，MIT），README 含架构图、运行步骤、Panta API 使用清单
- [ ] 已部署的可用产品 URL
- [ ] Demo 视频 ≤ 3 分钟（沙盒模式录制：雷达 → K 线 → 下单全流程）
- [ ] 简短项目描述 + 国家/区域信息

**主赛道额外**：
- [ ] Pitch deck（10 页：问题 → 方案 → 产品演示 → 技术架构 → 市场 → 商业模式〔API 订阅/告警付费〕→ 路线图 → 团队 → Ask）
- [ ] X (Twitter) 账号发进展帖，@PantaHQ 和 @colosseum

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| API key 迟迟拿不到 | D0 就注册；拿不到则先用 mock fixture 开发，key 到位即切换 |
| Rust 经验不足拖慢后端 | 用成熟框架（axum/sqlx/tokio），参考 Predix-backend 的目录结构；不写生命周期花哨代码 |
| ~~Panta crypto 类目太冷清~~（已确认：crypto 0 个 primary / 9 个 secondary，sports 占大头） | 已于 9/26 落地对策：全类目雷达 + sports 优先排序 |
| 时间不够 | 砍 stretch goals；聪明钱榜可降级为「大单流」；合约明确不进 MVP |
| 与 sonar-panta 撞车 | 我们主打实时性/K 线/交易终端，不做信号评分和跨平台价差 |

## 7. 参考资源

- Panta API 客户端参考实现（端点清单、限速、已知 bug）：github.com/G-ojies/sonar-panta → src/lib/panta.ts
- Rust 预测市场后端架构参考：github.com/sarthakitaliya/Predix-backend
- Panta 机制（pari-mutuel、创建费 1 SOL、创建者 20% 手续费分成）：github.com/ilichb/panta-market-simulator
- K 线库：github.com/tradingview/lightweight-charts
