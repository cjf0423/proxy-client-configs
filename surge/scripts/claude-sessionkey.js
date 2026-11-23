// Surge iOS/macOS script: Capture Claude sessionKey
// 自动从 claude.ai 请求中抓取 sessionKey
// 抓到后通过通知推送，同时存入 Surge 持久化存储
// 键名: claude.proxy.sessionkeys (换行分隔，多账号)

"use strict";

var KEY_LIST = "claude.proxy.sessionkeys";
var LAST_KEY = "claude.proxy.last_key";

function notify(title, subtitle, body) {
  try {
    if (typeof $notification !== "undefined" && $notification.post) {
      $notification.post(String(title || ""), String(subtitle || ""), String(body || ""));
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
    var part = parts[i];
    var idx = part.indexOf("=");
    if (idx <= 0) continue;
    var name = part.slice(0, idx).trim();
    var value = part.slice(idx + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

function mask(s) {
  s = String(s || "");
  if (!s) return "";
  if (s.length <= 20) return s;
  return s.slice(0, 15) + "..." + s.slice(-10);
}

function readKeyList() {
  var raw = $persistentStore.read(KEY_LIST) || "";
  return String(raw).split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean);
}

function saveKey(sessionKey) {
  if (!sessionKey) return { added: false, count: readKeyList().length };
  var list = readKeyList();
  var exists = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === sessionKey) { exists = true; break; }
  }
  if (!exists) list.push(sessionKey);
  $persistentStore.write(list.join("\n"), KEY_LIST);
  $persistentStore.write(sessionKey, LAST_KEY);
  return { added: !exists, count: list.length };
}

try {
  var cookie = getHeader($request.headers, "Cookie");
  var cookies = parseCookies(cookie);
  var names = Object.keys(cookies);

  // 尝试所有可能的 Claude session cookie 名
  var sessionKey = cookies["sessionKey"]
    || cookies["__Secure-next-auth.session-token"]
    || cookies["__cf_bm"] && cookies["sessionKey"]  // 确保有 cf 系列时也查
    || "";

  if (sessionKey) {
    var result = saveKey(sessionKey);
    if (result.added) {
      notify(
        "✅ Claude sessionKey 已捕获",
        "新账号 #" + result.count,
        "Key 前缀: " + mask(sessionKey)
      );
    }
  } else if (names.length > 0) {
    // 脚本触发了但没找到 sessionKey，通知一次帮助调试
    var debugKey = "claude.proxy.debug_notified";
    if (!$persistentStore.read(debugKey)) {
      $persistentStore.write("1", debugKey);
      notify(
        "⚠️ Claude 脚本已触发",
        "找到 " + names.length + " 个 Cookie 但没有 sessionKey",
        "Cookie: " + names.join(", ")
      );
    }
  }

  $done({});
} catch (e) {
  notify("Claude 脚本错误", String(e), "");
  $done({});
}
