# CBDB 仕途流场 — 离线提取

来源网站: https://dynasty-migration-vis.buyixiao.xyz

这是一个前端 (React/Vite) + 后端 API 的可视化应用。本目录用于把它提取成**纯本地离线版本**。

## 已完成
- `index.html` — 主页面
- `assets/index-*.js` / `assets/index-*.css` — 前端打包产物
- `favicon.svg`
- (待补) `data/` — 各朝代后端数据 (summary / flow / sankey)
- (待补) `geo/china-100000-full.json` — 中国地图

## 后端接口
- `GET /api/dynasties` — 朝代列表 (85 个，公开)
- `GET /api/summary?dynasty=<id>&provinces=all`
- `GET /api/flow?dynasty=<id>&provinces=all&gap=<5|10|20|50>`
- `GET /api/sankey?dynasty=<id>&provinces=all`
- `GET /geo/china-100000-full.json` — 地图 (公开)
- 认证: `POST /api/auth/send-code {email}` → `POST /api/auth/verify {email,code,userId}` → Bearer token

## 说明
- 仅「明朝(id=19) + 全国」视图公开，其余朝代需登录 token。
- 省份筛选为组合爆炸，离线版只镜像「全国 (provinces=all)」视图。
