/**
 * ipaTool BoxJS 操作面板
 * 作者: 小H
 * 功能: 通过 BoxJS 界面操作 Apple Store API（登录、搜索、查看版本、下载安装）
 * 依赖: githubdulong/Script 的 ipaTool.sgmodule 模块
 *
 * 使用方法:
 *   Surge/Stash 中添加此脚本为 cron 或手动运行脚本
 *   在 BoxJS 中配置参数后，通过 HTTP-API 或手动触发执行对应操作
 *
 * 操作触发说明:
 *   本脚本通过读取 BoxJS 中 ipatool_action 的值来决定执行的操作:
 *     login    - 登录 Apple ID
 *     refresh  - 刷新 Token
 *     reset    - 重置登录状态
 *     search   - 搜索应用
 *     versions - 查看历史版本
 *     download - 获取应用下载信息
 *     purchase - 购买/获取应用授权
 */

const $ = new Env("ipaTool");
const API_BASE = "https://apple-api.com";

// 读取 BoxJS 配置
const getConfig = (key, fallback = "") => $.getdata(`ipatool_${key}`) || fallback;
const setConfig = (key, val) => $.setdata(String(val), `ipatool_${key}`);

// 从通知触发的 action，或 BoxJS 设置的 action
const ACTION = typeof $argument !== "undefined" && $argument
  ? $argument
  : getConfig("action", "search");

async function httpRequest(method, path, body = null) {
  const url = `${API_BASE}${path}`;
  const headers = { "Content-Type": "application/json" };
  const opts = { url, headers };
  if (body) opts.body = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const cb = (err, resp, data) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({ success: false, message: data || "空响应" });
      }
    };
    method === "POST" ? $.post(opts, cb) : $.get(opts, cb);
  });
}

// ========== 操作函数 ==========

async function doLogin() {
  const appleId = getConfig("apple_id");
  const password = getConfig("password");
  const code = getConfig("2fa_code");

  if (!appleId || !password) {
    return notify("❌ 登录失败", "请先在 BoxJS 中填写 Apple ID 和密码");
  }

  const body = { appleId, password };
  if (code) body.code = code;

  const res = await httpRequest("POST", "/auth/login", body);
  if (res.success) {
    const acct = res.data?.accountInfo?.appleId || appleId;
    notify("✅ 登录成功", `账号: ${acct}`);
    // 清除密码和验证码（安全）
    setConfig("password", "");
    setConfig("2fa_code", "");
  } else {
    const msg = res.message || JSON.stringify(res);
    if (msg.includes("验证码") || msg.includes("code") || msg.includes("2FA")) {
      notify("🔐 需要双重验证", "请在 BoxJS 中填写验证码后重新登录");
    } else {
      notify("❌ 登录失败", msg);
    }
  }
  setResult(res);
}

async function doRefresh() {
  const res = await httpRequest("POST", "/auth/refresh");
  notify(res.success ? "✅ Token 已刷新" : "❌ 刷新失败", res.message || "");
  setResult(res);
}

async function doReset() {
  const res = await httpRequest("POST", "/auth/reset");
  notify(res.success ? "✅ 已重置登录状态" : "❌ 重置失败", res.message || "");
  setResult(res);
}

async function doSearch() {
  const term = getConfig("search_term");
  const country = getConfig("country", "CN");
  if (!term) return notify("❌ 搜索失败", "请填写搜索关键词");

  const res = await httpRequest("GET", `/apps/search/${encodeURIComponent(term)}?limit=10&country=${country}`);
  if (res.success && res.data?.results) {
    const apps = res.data.results;
    const lines = apps.map((app, i) =>
      `${i + 1}. ${app.trackName || app.name}\n   ID: ${app.trackId || app.appId}\n   ${app.version || ""} | ${app.artistName || ""}`
    );
    const summary = `🔍 搜索「${term}」找到 ${apps.length} 个应用:\n\n${lines.join("\n\n")}`;
    notify("🔍 搜索完成", `找到 ${apps.length} 个应用，详情见结果框`);
    setResult({ summary, raw: res });
  } else {
    notify("❌ 搜索失败", res.message || "无结果");
    setResult(res);
  }
}

async function doVersions() {
  const appId = getConfig("app_id");
  if (!appId) return notify("❌ 查看版本失败", "请填写应用 ID");

  const source = getConfig("version_source", "official");
  const verId = getConfig("version_id");

  let path;
  if (source === "official") {
    path = `/apps/${appId}/versions`;
    if (verId) path += `?appVerId=${verId}`;
  } else {
    path = `/apps/${appId}/versions/legacy?selset=${source}`;
  }

  const res = await httpRequest("GET", path);
  if (res.success && res.data) {
    const versions = res.data.versionList || res.data.versions || res.data;
    let lines;
    if (Array.isArray(versions)) {
      lines = versions.slice(0, 30).map((v, i) => {
        const ver = v.displayVersion || v.version || v.bundle_version || "?";
        const vid = v.appVerId || v.external_identifier || v.versionId || "?";
        const date = v.releaseDate || v.created || "";
        return `${i + 1}. v${ver}  (ID: ${vid})${date ? "  " + date : ""}`;
      });
    } else {
      lines = [JSON.stringify(versions, null, 2).slice(0, 2000)];
    }
    const summary = `📜 应用 ${appId} 的历史版本 (${source}):\n\n${lines.join("\n")}`;
    notify("📜 版本列表", `共 ${lines.length} 个版本，详情见结果框`);
    setResult({ summary, raw: res });
  } else {
    notify("❌ 查询版本失败", res.message || "无结果");
    setResult(res);
  }
}

async function doDownload() {
  const appId = getConfig("app_id");
  if (!appId) return notify("❌ 下载失败", "请填写应用 ID");

  const verId = getConfig("version_id");
  let path = `/apps/${appId}`;
  if (verId) path += `?appVerId=${verId}`;

  const res = await httpRequest("GET", path);
  if (res.success && res.data) {
    const d = res.data;
    const name = d.name || d.trackName || "未知";
    const ver = d.displayVersion || d.version || "?";
    const size = d.size ? `${(d.size / 1024 / 1024).toFixed(1)} MB` : "未知";
    const url = d.url || d.downloadUrl || "";

    let summary = `📦 ${name} v${ver}\n大小: ${size}\n包名: ${d.bundleId || "?"}\n版本ID: ${d.appVerId || verId || "最新"}`;
    if (url) {
      summary += `\n\n⬇️ 下载链接:\n${url}`;
      // 如果有安装链接，通过 installapp 触发安装
      const installUrl = `https://xiaobai.app?name=${encodeURIComponent(name)}&displayVersion=${ver}&bundleId=${d.bundleId || ""}&fileName=${encodeURIComponent(url.split("/").pop() || "")}`;
      summary += `\n\n📲 安装链接:\nitms-services://?action=download-manifest&url=${encodeURIComponent(installUrl)}`;
    }
    notify("📦 获取成功", `${name} v${ver} (${size})`);
    setResult({ summary, raw: res });
  } else {
    notify("❌ 获取失败", res.message || "无结果");
    setResult(res);
  }
}

async function doPurchase() {
  const appId = getConfig("app_id");
  if (!appId) return notify("❌ 购买失败", "请填写应用 ID");

  const res = await httpRequest("POST", `/apps/${appId}/purchase`);
  if (res.success) {
    notify("✅ 购买成功", `应用 ${appId} 已加入已购列表`);
  } else {
    notify("❌ 购买失败", res.message || "");
  }
  setResult(res);
}

// ========== 工具函数 ==========

function notify(title, subtitle, body = "") {
  $.msg(title, subtitle, body);
}

function setResult(data) {
  const text = typeof data === "object"
    ? (data.summary || JSON.stringify(data, null, 2))
    : String(data);
  // 截断过长的结果
  setConfig("last_result", text.slice(0, 5000));
}

// ========== 主流程 ==========

(async () => {
  try {
    $.log(`📱 ipaTool 执行操作: ${ACTION}`);
    switch (ACTION) {
      case "login":    await doLogin(); break;
      case "refresh":  await doRefresh(); break;
      case "reset":    await doReset(); break;
      case "search":   await doSearch(); break;
      case "versions": await doVersions(); break;
      case "download": await doDownload(); break;
      case "purchase": await doPurchase(); break;
      default:
        notify("❓ 未知操作", `操作 "${ACTION}" 不存在`, "支持: login/search/versions/download/purchase/refresh/reset");
    }
  } catch (e) {
    $.log(`❌ 执行出错: ${e.message || e}`);
    notify("❌ 执行出错", e.message || String(e));
    setResult({ error: e.message || String(e) });
  } finally {
    $.done();
  }
})();

// ========== Env 类 (兼容 Surge/Stash/Loon/QX) ==========
function Env(name) {
  const isQx = typeof $task !== "undefined";
  const isSurge = typeof $httpClient !== "undefined" && !isQx;
  const isLoon = typeof $loon !== "undefined";
  const isStash = typeof $environment !== "undefined" && typeof $environment["stash-build"] !== "undefined";

  this.name = name;
  this.log = (...args) => console.log(`[${name}]`, ...args);
  this.msg = (title, subtitle = "", body = "") => {
    if (isQx) $notify(title, subtitle, body);
    else if (isSurge || isLoon || isStash) $notification.post(title, subtitle, body);
  };
  this.getdata = (key) => {
    if (isQx) return $prefs.valueForKey(key);
    if (isSurge || isLoon || isStash) return $persistentStore.read(key);
  };
  this.setdata = (val, key) => {
    if (isQx) return $prefs.setValueForKey(val, key);
    if (isSurge || isLoon || isStash) return $persistentStore.write(val, key);
  };
  this.get = (opts, cb) => {
    if (isQx) $task.fetch(opts).then(r => cb(null, r, r.body), cb);
    else if (isSurge || isLoon || isStash) $httpClient.get(opts, cb);
  };
  this.post = (opts, cb) => {
    if (isQx) {
      opts.method = "POST";
      $task.fetch(opts).then(r => cb(null, r, r.body), cb);
    } else if (isSurge || isLoon || isStash) {
      $httpClient.post(opts, cb);
    }
  };
  this.done = (val = {}) => $done(val);
}
