/*
 * 离线适配层 — CBDB 仕途流场
 * 1) 拦截后端 API → 读取本地 ./data 预抓 JSON
 * 2) 伪造登录态，解锁参数控件
 * 3) 省份筛选：单选直接用单省文件；多选时在前端按省求和合并
 *    （每人仅一个籍贯，各类计数可加，已与后端逐一核对一致）
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

  // 性能：流场每帧重绘每一条边，边数过多会拖慢渲染。这里保留"流量最大"的前 N 条边，
  // 原始数据文件完整保留不受影响。可在打开页面前用 window.FLOW_EDGE_CAP=数值 调整（0=不限制）。
  var FLOW_EDGE_CAP = typeof window.FLOW_EDGE_CAP === "number" ? window.FLOW_EDGE_CAP : 800;

  function capFlow(obj) {
    if (obj && FLOW_EDGE_CAP > 0 && obj.edges && obj.edges.length > FLOW_EDGE_CAP) {
      obj.edges = obj.edges.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, FLOW_EDGE_CAP);
    }
    return obj;
  }

  var origFetch = window.fetch.bind(window);
  var mergeCache = {}; // url -> Promise<Response 模板对象>

  function loadJSON(url) {
    return origFetch(url, { cache: "force-cache" }).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; });
  }

  // ---- 合并函数（多选省份 = 各单省之和）----

  function topList(map, n) {
    return Object.keys(map)
      .map(function (l) { return { label: l, count: map[l] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, n);
  }

  function mergeSummary(parts, dynasty, provIds) {
    var t = { cohortCount: 0, withEntry: 0, withPosting: 0, withFlow: 0 };
    var em = {}, om = {};
    parts.forEach(function (d) {
      if (!d) return;
      if (d.totals) Object.keys(t).forEach(function (k) { t[k] += d.totals[k] || 0; });
      (d.entries || []).forEach(function (e) { em[e.label] = (em[e.label] || 0) + e.count; });
      (d.offices || []).forEach(function (e) { om[e.label] = (om[e.label] || 0) + e.count; });
    });
    return {
      dynasty: dynasty, provinceFilter: provIds,
      totals: t, entries: topList(em, 10), offices: topList(om, 12)
    };
  }

  function mergeFlow(parts, dynasty, provIds, gap) {
    var edges = {}, tl = {};
    parts.forEach(function (d) {
      if (!d) return;
      (d.edges || []).forEach(function (e) {
        var k = e.entryType + "|" + e.originProvinceId + "|" + e.destinationProvinceId + "|" + e.decade;
        var x = edges[k];
        if (!x) {
          edges[k] = {
            entryType: e.entryType,
            originProvinceId: e.originProvinceId, originName: e.originName,
            originLon: e.originLon, originLat: e.originLat,
            destinationProvinceId: e.destinationProvinceId, destinationName: e.destinationName,
            destinationLon: e.destinationLon, destinationLat: e.destinationLat,
            decade: e.decade, count: e.count, firstYear: e.firstYear, lastYear: e.lastYear
          };
        } else {
          x.count += e.count;
          if (e.firstYear != null) x.firstYear = x.firstYear == null ? e.firstYear : Math.min(x.firstYear, e.firstYear);
          if (e.lastYear != null) x.lastYear = x.lastYear == null ? e.lastYear : Math.max(x.lastYear, e.lastYear);
        }
      });
      (d.timeline || []).forEach(function (p) { tl[p.decade] = (tl[p.decade] || 0) + p.count; });
    });
    var timeline = Object.keys(tl).map(function (k) {
      return { decade: k === "null" ? null : Number(k), count: tl[k] };
    }).sort(function (a, b) { return (a.decade || 0) - (b.decade || 0); });
    return {
      dynasty: dynasty, provinceFilter: provIds, gap: gap,
      edges: Object.keys(edges).map(function (k) { return edges[k]; }),
      timeline: timeline
    };
  }

  function mergeSankey(parts, dynasty, provIds) {
    var sum = { totalOfficials: 0, parentOfficial: 0, ancestorOfficial: 0, anyLineageOfficial: 0, knownLineage: 0 };
    var rowm = {};
    parts.forEach(function (d) {
      if (!d) return;
      if (d.summary) Object.keys(sum).forEach(function (k) { sum[k] += d.summary[k] || 0; });
      (d.rows || []).forEach(function (r) {
        var k = r.ancestor_status + "|" + r.parent_status + "|" + r.self_status;
        if (!rowm[k]) rowm[k] = { ancestor_status: r.ancestor_status, parent_status: r.parent_status, self_status: r.self_status, count: 0 };
        rowm[k].count += r.count;
      });
    });
    var rows = Object.keys(rowm).map(function (k) { return rowm[k]; });
    // 节点：col0 祖辈 / col1 父辈 / col2 本人，按列内总量降序排
    var colTotals = [{}, {}, {}];
    rows.forEach(function (r) {
      colTotals[0]["ancestor:" + r.ancestor_status] = (colTotals[0]["ancestor:" + r.ancestor_status] || 0) + r.count;
      colTotals[1]["parent:" + r.parent_status] = (colTotals[1]["parent:" + r.parent_status] || 0) + r.count;
      colTotals[2]["self:" + r.self_status] = (colTotals[2]["self:" + r.self_status] || 0) + r.count;
    });
    var nodes = [], index = {};
    [0, 1, 2].forEach(function (c) {
      Object.keys(colTotals[c]).sort(function (a, b) { return colTotals[c][b] - colTotals[c][a]; })
        .forEach(function (id) {
          index[id] = nodes.length;
          nodes.push({ id: id, label: id.slice(id.indexOf(":") + 1), column: c });
        });
    });
    // 连线：col0→col1（按祖辈,父辈聚合）、col1→col2（按父辈,本人聚合）
    var l01 = {}, l12 = {};
    rows.forEach(function (r) {
      var a = "ancestor:" + r.ancestor_status, p = "parent:" + r.parent_status, s = "self:" + r.self_status;
      l01[a + ">" + p] = (l01[a + ">" + p] || 0) + r.count;
      l12[p + ">" + s] = (l12[p + ">" + s] || 0) + r.count;
    });
    var links = [];
    function pushLinks(m) {
      Object.keys(m).forEach(function (k) {
        var ab = k.split(">");
        links.push({ source: index[ab[0]], target: index[ab[1]], value: m[k] });
      });
    }
    pushLinks(l01); pushLinks(l12);
    return { dynasty: dynasty, provinceFilter: provIds, summary: sum, rows: rows, nodes: nodes, links: links };
  }

  // ---- 省份筛选请求 → 合并单省文件 ----

  function filteredResponse(kind, dynasty, provIds, gap) {
    var num = provIds.map(Number);
    var urls = provIds.map(function (p) {
      if (kind === "flow") return "./data/flow_" + dynasty + "_prov" + p + "_gap" + gap + ".json";
      return "./data/" + kind + "_" + dynasty + "_prov" + p + ".json";
    });
    return Promise.all(urls.map(loadJSON)).then(function (parts) {
      var got = parts.filter(Boolean);
      var merged;
      if (kind === "summary") merged = mergeSummary(got, Number(dynasty), num);
      else if (kind === "flow") merged = capFlow(mergeFlow(got, Number(dynasty), num, Number(gap)));
      else merged = mergeSankey(got, Number(dynasty), num);
      return json(merged);
    });
  }

  function localDataURL(path, sp) {
    var dynasty = sp.get("dynasty");
    var gap = sp.get("gap") || "10";
    if (path === "/api/dynasties") return "./data/dynasties.json";
    if (path === "/api/provinces") return "./data/provinces/provinces_" + dynasty + ".json";
    if (path === "/api/summary") return "./data/summary_" + dynasty + "_all.json";
    if (path === "/api/sankey") return "./data/sankey_" + dynasty + "_all.json";
    if (path === "/api/flow") return "./data/flow_" + dynasty + "_all_gap" + gap + ".json";
    return null;
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var u;
    try { u = new URL(url, location.href); } catch (e) { return origFetch(input, init); }
    if (u.origin !== location.origin) return origFetch(input, init);

    var path = u.pathname;
    var sp = u.searchParams;

    // 认证：离线始终视为已登录
    if (path === "/api/auth/me") return Promise.resolve(json({ ok: true, user: OFFLINE_USER }));
    if (path === "/api/auth/send-code") return Promise.resolve(json({ ok: true, expiresInSec: 600 }));
    if (path === "/api/auth/verify")
      return Promise.resolve(json({ ok: true, token: "offline-token", user: OFFLINE_USER, expiresAt: "2099-01-01T00:00:00.000Z" }));
    if (path === "/api/auth/logout") return Promise.resolve(json({ ok: true }));
    if (path.indexOf("/api/logs") === 0) return Promise.resolve(json({ ok: true }));

    // 省份筛选（provinces 非空且非 all）→ 合并单省数据
    var pr = sp.get("provinces");
    var filtered = pr && pr !== "all";
    if (filtered && (path === "/api/summary" || path === "/api/sankey" || path === "/api/flow")) {
      var provIds = pr.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      var kind = path.slice(5); // summary | sankey | flow
      var gap = sp.get("gap") || "10";
      var ck = path + "?dynasty=" + sp.get("dynasty") + "&p=" + provIds.slice().sort().join(",") + (kind === "flow" ? "&gap=" + gap : "");
      if (!mergeCache[ck]) {
        mergeCache[ck] = filteredResponse(kind, sp.get("dynasty"), provIds, gap);
      }
      return mergeCache[ck].then(function (r) { return r.clone(); });
    }

    // 全国 flow → 读取本地文件后应用流线上限
    if (path === "/api/flow") {
      return loadJSON(localDataURL(path, sp)).then(function (d) {
        if (!d) return json({ error: "offline", message: "离线数据缺失", statusCode: 404 }, 404);
        return json(capFlow(d));
      });
    }

    // 其他数据接口 → 本地 JSON
    var dataUrl = localDataURL(path, sp);
    if (dataUrl) {
      return origFetch(dataUrl, { cache: "force-cache" }).then(function (r) {
        if (r.ok) return r;
        return json({ error: "offline", message: "离线数据缺失", statusCode: 404 }, 404);
      });
    }

    // 静态资源（/geo、/assets 等）走原始 fetch
    return origFetch(input, init);
  };
})();
