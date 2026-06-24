# CBDB 仕途流场 — 离线优化版

中国历代入仕、任官与亲属关系可视化。原站：https://dynasty-migration-vis.buyixiao.xyz

这是把原在线应用（前端 + 后端实时计算）提取并改造成的**纯本地离线版本**：所有数据预先抓取到本地，打开即用，无需登录、无网络往返，并对渲染做了性能优化。

## 如何运行

不能直接双击用 `file://` 打开（浏览器会拦截本地 `fetch`）。需要一个静态服务器，把**本目录作为网站根目录**：

```bash
# 方式一：用自带脚本（默认端口 8848）
bash start.sh
# 或指定端口： bash start.sh 9000

# 方式二：手动
python3 -m http.server 8848
```

然后浏览器打开 **http://localhost:8848/**

## 做了哪些优化

1. **离线数据**（最大提速）：原站每次切换朝代/省份/时间间隔都要等后端重新聚合计算（很慢，这是"卡"的主因之一）。现在 85 个朝代的 `summary / sankey / flow`（含 5/10/20/50 四档 gap）全部预抓到 `./data`，切换瞬间完成。
2. **渲染优化（shadowBlur）**：原流场动画对**每一根流线、每一个粒子**每帧都开启 canvas `shadowBlur`（阴影模糊是 2D canvas 最昂贵的操作）。改为**仅对鼠标悬停高亮的那条线/粒子**开启辉光，其余关闭。
3. **流线数量上限**：经分析，明朝默认视图有 1400 条边、其中约 62% 是 count=1 的单人细流；每帧重绘全部流线是"打开慢/卡"的主因。`offline.js` 默认只渲染**流量最大的前 800 条边**（原始数据完整保留在 `./data`，未删改）。可在打开页面前通过控制台 `window.FLOW_EDGE_CAP=2000`（或 `0` 表示不限制）调整。
4. **去掉外部依赖**：移除百度统计埋点脚本（`hm.baidu.com`，离线时会挂起且属于跟踪），日志埋点接口本地直接吞掉。
5. **免登录**：通过 `offline.js` 伪造登录态，原本"修改参数需登录"的限制在离线版解除。

## 省份筛选（离线实现）

只有 **宋(15)、元(18)、明(19)、清(20)、中华民国(21)** 这 5 个朝代有省份数据。原站省份筛选是后端按所选省份重新聚合，无法预存所有组合（组合爆炸）。

由于每个人只有一个籍贯、各类计数可加（已逐一与后端核对），离线版改为：**预存每个单省的数据，多选省份时在前端把各单省数据求和合并**（`offline.js` 中的 `mergeSummary / mergeFlow / mergeSankey`，sankey 节点连线按祖辈→父辈→本人重建）。

- **单选省份 / 全国视图**：结果与原站完全一致。
- **多选省份**：`totals`、入仕方式、flow 流向、sankey 亲属关系均精确求和；唯一近似是 summary 里**排名靠后的少数任官地**——因为后端单省接口只返回 top-N 任官，求和时榜尾边界可能少计（top 任官精确，榜尾偏差通常 <一两项）。

## 目录结构

- `index.html` — 主页面（已注入 `offline.js`、移除百度统计）
- `offline.js` — 离线适配层：拦截 `/api/*` → 本地 `./data`，伪造登录态
- `assets/index-*.js` — 前端 bundle（已打性能补丁）
- `assets/index-*.js.orig` — 原始未改动 bundle（备份，可删）
- `assets/index-*.css`、`favicon.svg`
- `geo/china-100000-full.json` — 中国地图 GeoJSON
- `data/` — 预抓取的后端数据
  - `dynasties.json` — 朝代列表
  - `summary_<id>_all.json`、`sankey_<id>_all.json`、`flow_<id>_all_gap<5|10|20|50>.json` — 全国视图
  - `summary_<id>_prov<pid>.json`、`sankey_<id>_prov<pid>.json`、`flow_<id>_prov<pid>_gap<n>.json` — 单省（用于省份筛选合并）
  - `provinces/provinces_<id>.json` — 各朝代省份列表

## 已知限制

- **多选省份的任官地榜尾**：见上节，少数排名靠后的任官地计数可能略偏小（top 项精确）。
- **流线上限**：默认只画流量前 800 条边，可用 `window.FLOW_EDGE_CAP` 调整或设 0 取消。
- 数据为提取时的快照，原站后续更新不会反映到本地。

## 后端接口参考（原站）

- `GET /api/dynasties`
- `GET /api/summary?dynasty=<id>&provinces=all`
- `GET /api/flow?dynasty=<id>&provinces=all&gap=<5|10|20|50>`
- `GET /api/sankey?dynasty=<id>&provinces=all`
- 认证：`POST /api/auth/send-code {email}` → `POST /api/auth/verify {email,code,userId}` → Bearer token
