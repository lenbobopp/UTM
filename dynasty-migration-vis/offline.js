/*
 * 离线适配层 — CBDB 仕途流场
 * 拦截所有后端 API 请求，改为读取本地 ./data 下预先抓取的 JSON。
 * 同时伪造登录态，使「切换朝代 / 调整 gap」等参数操作无需联网即可使用。
 * 必须在主 bundle 之前以普通 <script> 加载。
 */
(function () {
  "use strict";

  var OFFLINE_USER = {
    id: "offline",
    email: "离线用户 (offline)",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "2026-01-01T00:00:00.000Z"
  };

  // 预置一个 token，让前端启动时进入"已登录"分支并解锁参数控件。
  try {
    if (!localStorage.getItem("cbdbvisx_auth_token")) {
      localStorage.setItem("cbdbvisx_auth_token", "offline-token");
    }
    localStorage.setItem("cbdbvisx_auth_user", JSON.stringify(OFFLINE_USER));
  } catch (e) {}

  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 把 API 请求映射到本地数据文件。离线版只镜像「全国 (provinces=all)」视图，
  // 省份筛选会优雅回退到全国数据。
  function localDataURL(path, sp) {
    var dynasty = sp.get("dynasty");
    var gap = sp.get("gap") || "10";
    if (path === "/api/dynasties") return "./data/dynasties.json";
    if (path === "/api/summary") return "./data/summary_" + dynasty + "_all.json";
    if (path === "/api/sankey") return "./data/sankey_" + dynasty + "_all.json";
    if (path === "/api/flow") return "./data/flow_" + dynasty + "_all_gap" + gap + ".json";
    return null;
  }

  var origFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var u;
    try {
      u = new URL(url, location.href);
    } catch (e) {
      return origFetch(input, init);
    }

    // 跨域请求（如阿里云地图兜底）维持原行为
    if (u.origin !== location.origin) return origFetch(input, init);

    var path = u.pathname;

    // 认证：离线下始终视为已登录
    if (path === "/api/auth/me") return Promise.resolve(json({ ok: true, user: OFFLINE_USER }));
    if (path === "/api/auth/send-code") return Promise.resolve(json({ ok: true, expiresInSec: 600 }));
    if (path === "/api/auth/verify")
      return Promise.resolve(
        json({ ok: true, token: "offline-token", user: OFFLINE_USER, expiresAt: "2099-01-01T00:00:00.000Z" })
      );
    if (path === "/api/auth/logout") return Promise.resolve(json({ ok: true }));

    // 埋点 / 日志：直接吞掉
    if (path.indexOf("/api/logs") === 0) return Promise.resolve(json({ ok: true }));

    // 数据接口 → 本地 JSON
    var dataUrl = localDataURL(path, u.searchParams);
    if (dataUrl) {
      return origFetch(dataUrl, { cache: "force-cache" }).then(function (r) {
        if (r.ok) return r;
        return json(
          { error: "offline", message: "离线版仅包含「全国」视图数据", statusCode: 404 },
          404
        );
      });
    }

    // 其余（/geo、/assets 等静态文件）走原始 fetch（由本地静态服务器提供）
    return origFetch(input, init);
  };
})();
