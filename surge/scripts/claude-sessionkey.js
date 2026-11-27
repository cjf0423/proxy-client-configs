// Surge script: capture claude.ai sessionKey + Cookie + UA + org for claude-free-proxy
// 只抓你自己浏览器里已登录的 claude.ai 会话，数据仅存本机 Surge 持久化存储。
//
// 对应 claude-free-proxy 的 POST /v1/accounts 字段:
//   sessionKey (必填) | org (可选, 缺省由代理自动发现) | cookie (可选, 含 cf_clearance) | ua (与 cf_clearance 绑定)
//
// 持久化键名:
//   claude.proxy.sessionkeys   换行分隔的 sessionKey 列表
//   claude.proxy.last_key      最新 sessionKey
//   claude.proxy.last_cookie   最新完整 Cookie 头
//   claude.proxy.last_ua       最新 User-Agent
//   claude.proxy.last_org      最新 org uuid
//   claude.proxy.last_payload  可直接 POST 的 JSON (label/sessionKey/cookie/ua/org)

"use strict";

var NS = "claude.proxy.";
var KEY_LIST = NS + "sessionkeys";
var LAST_KEY = NS + "last_key";
var LAST_COOKIE = NS + "last_cookie";
var LAST_UA = NS + "last_ua";
var LAST_ORG = NS + "last_org";
var LAST_PAYLOAD = NS + "last_payload";
var LAST_SIG = NS + "last_sig";
var LAST_NOTIFIED = NS + "last_notified";
var THROTTLE_MS = 10 * 60 * 1000; // cf_clearance 刷新类通知的最小间隔

function notify(title, subtitle, body, opts) {
  try {
    if (typeof $notification !== "undefined" && $notification.post) {
      $notification.post(String(title || ""), String(subtitle || ""), String(body || ""), opts || {});
    }
  } catch (_) {}
}

function getHeader(headers, name) {
  if (!headers) return "";
  var lower = String(name).toLowerCase();
  for (var k in headers) {
    if (String(k).toLowerCase() === lower) return headers[k];
  }
  return "";
}

function parseCookies(cookieHeader) {
  var out = {};
  if (!cookieHeader) return out;
  var parts = String(cookieHeader).split(";");
  for (var i = 0; i < parts.length; i++) {
    var idx = parts[i].indexOf("=");
    if (idx <= 0) continue;
    var name = parts[i].slice(0, idx).trim();
    var value = parts[i].slice(idx + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

function mask(s) {
  s = String(s || "");
  if (s.length <= 20) return s;
  return s.slice(0, 15) + "..." + s.slice(-6);
}

function readKeyList() {
  var raw = $persistentStore.read(KEY_LIST) || "";
  return String(raw).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function saveKey(sessionKey) {
  var list = readKeyList();
  var exists = list.indexOf(sessionKey) !== -1;
  if (!exists) list.push(sessionKey);
  $persistentStore.write(list.join("\n"), KEY_LIST);
  $persistentStore.write(sessionKey, LAST_KEY);
  return { added: !exists, count: list.length, index: list.indexOf(sessionKey) + 1 };
}

function findOrg(cookies, url) {
  var fromCookie = cookies["lastActiveOrg"] || "";
  if (/^[0-9a-f-]{36}$/i.test(fromCookie)) return fromCookie;
  var m = /\/api\/organizations\/([0-9a-f-]{36})/i.exec(String(url || ""));
  return m ? m[1] : "";
}

try {
  var cookie = getHeader($request.headers, "Cookie");
  var ua = getHeader($request.headers, "User-Agent");
  var cookies = parseCookies(cookie);
  var sessionKey = cookies["sessionKey"] || "";

  if (sessionKey) {
    var org = findOrg(cookies, $request.url) || ($persistentStore.read(LAST_ORG) || "");
    var cf = cookies["cf_clearance"] || "";
    var sig = sessionKey + "|" + cf + "|" + org;
    var prevSig = $persistentStore.read(LAST_SIG) || "";

    if (sig !== prevSig) {
      var result = saveKey(sessionKey);
      if (cookie) $persistentStore.write(cookie, LAST_COOKIE);
      if (ua) $persistentStore.write(ua, LAST_UA);
      if (org) $persistentStore.write(org, LAST_ORG);

      var payload = { label: "surge-" + sessionKey.slice(-6), sessionKey: sessionKey, cookie: cookie, ua: ua };
      if (org) payload.org = org;
      var payloadText = JSON.stringify(payload);
      $persistentStore.write(payloadText, LAST_PAYLOAD);
      $persistentStore.write(sig, LAST_SIG);

      var now = Date.now();
      var lastNotified = parseInt($persistentStore.read(LAST_NOTIFIED) || "0", 10) || 0;
      if (result.added || now - lastNotified > THROTTLE_MS) {
        $persistentStore.write(String(now), LAST_NOTIFIED);
        notify(
          result.added ? "✅ Claude 凭据已捕获" : "🔄 Claude 凭据已更新",
          "账号 #" + result.index + " | cf_clearance: " + (cf ? "有" : "无") + " | org: " + (org ? "有" : "无"),
          "Key: " + mask(sessionKey) + "\n点击通知复制可导入 JSON",
          { action: "clipboard", text: payloadText }
        );
      }
    }
  }
  $done({});
} catch (e) {
  notify("Claude 脚本错误", String(e), "");
  $done({});
}
