// Surge iOS/macOS script: Capture Claude sessionKey for claude-free-proxy
// 自动从 claude.ai 请求中抓取 sessionKey 并存储
//
// 持久化键名:
//   claude.proxy.sessionkeys    换行分隔的 sessionKey 列表（多账号）
//   claude.proxy.last_key       最新抓到的 sessionKey
//   claude.proxy.last_cookie    最新完整 Cookie
//   claude.proxy.debug          调试信息
//
// 查看页: http://claude-key.local/

"use strict";

var STORE_KEY = "claude.proxy.capture.v1";
var KEY_LIST = "claude.proxy.sessionkeys";
var LAST_KEY = "claude.proxy.last_key";
var LAST_COOKIE = "claude.proxy.last_cookie";
var DEBUG_KEY = "claude.proxy.debug";

var DEBUG_NOTIFY = false;

function nowISO() {
  return new Date().toISOString();
}

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
  return s.slice(0, 10) + "…" + s.slice(-10);
}

function readKeyList() {
  var raw = $persistentStore.read(KEY_LIST) || "";
  return String(raw).split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean);
}

function saveKey(sessionKey, cookie) {
  if (!sessionKey) return { added: false, count: readKeyList().length };
  var list = readKeyList();
  var exists = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === sessionKey) { exists = true; break; }
  }
  if (!exists) list.push(sessionKey);
  $persistentStore.write(list.join("\n"), KEY_LIST);
  $persistentStore.write(sessionKey, LAST_KEY);
  if (cookie) $persistentStore.write(cookie, LAST_COOKIE);
  return { added: !exists, count: list.length };
}

function htmlEscape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function respondHTML(body) {
  $done({
    response: {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      body: body
    }
  });
}

function viewPage() {
  var url = $request.url || "";
  if (url.indexOf("clear=1") >= 0) {
    $persistentStore.write("", STORE_KEY);
    $persistentStore.write("", KEY_LIST);
    $persistentStore.write("", LAST_KEY);
    $persistentStore.write("", LAST_COOKIE);
    $persistentStore.write("", DEBUG_KEY);
    return respondHTML('<meta name="viewport" content="width=device-width,initial-scale=1"><h2>已清除 Claude sessionKey 缓存</h2><p><a href="/">返回</a></p>');
  }

  var keyList = $persistentStore.read(KEY_LIST) || "";
  var lastKey = $persistentStore.read(LAST_KEY) || "";
  var debug = $persistentStore.read(DEBUG_KEY) || "";
  var count = readKeyList().length;

  if (!lastKey) {
    return respondHTML('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;line-height:1.5;max-width:900px;margin:auto}pre{background:#f5f5f5;padding:10px;border-radius:8px;white-space:pre-wrap;word-break:break-all}</style>' +
      '<h2>还没有捕获到 Claude sessionKey</h2>' +
      '<ol>' +
      '<li>确认 Surge 已开启 MitM 且已信任证书</li>' +
      '<li>确认 MITM hostname 包含 claude.ai</li>' +
      '<li>打开 Safari 访问 https://claude.ai 并登录</li>' +
      '<li>登录后随便聊一句，脚本会自动抓取</li>' +
      '</ol>' +
      '<h3>Debug</h3><pre>' + htmlEscape(debug) + '</pre>');
  }

  return respondHTML('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;line-height:1.5;max-width:900px;margin:auto}' +
    'pre{background:#f5f5f5;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-all}' +
    'button{font-size:16px;padding:8px 16px;margin:4px 0;border-radius:8px;border:1px solid #ccc;background:#fff}' +
    'button:active{background:#e0e0e0}.warn{color:#b00020}</style>' +
    '<h2>✅ Claude sessionKey 已捕获</h2>' +
    '<p class="warn">这是登录凭证，等同账号权限，不要泄露！</p>' +
    '<h3>已捕获的 sessionKey（共 ' + count + ' 个账号）</h3>' +
    '<pre id="keyList">' + htmlEscape(keyList) + '</pre>' +
    '<button onclick="navigator.clipboard.writeText(document.getElementById(\'keyList\').innerText).then(()=>alert(\'已复制！\'))">📋 复制全部 Key</button>' +
    '<h3>最新 sessionKey</h3>' +
    '<pre id="lastKey">' + htmlEscape(lastKey) + '</pre>' +
    '<button onclick="navigator.clipboard.writeText(document.getElementById(\'lastKey\').innerText).then(()=>alert(\'已复制！\'))">📋 复制最新 Key</button>' +
    '<p style="margin-top:30px"><a href="/?clear=1" style="color:red">🗑 清除所有缓存</a></p>');
}

try {
  var reqUrl = $request.url || "";

  if (/^http:\/\/claude-key\.local\//i.test(reqUrl) || /^http:\/\/claude-key\.local$/i.test(reqUrl)) {
    viewPage();
  } else {
    var cookie = getHeader($request.headers, "Cookie");
    var cookies = parseCookies(cookie);
    var sessionKey = cookies["sessionKey"] || cookies["__Secure-next-auth.session-token"] || "";
    var cfClearance = cookies["cf_clearance"] || "";

    var debugInfo = [
      "time=" + nowISO(),
      "url=" + reqUrl,
      "has_cookie=" + (cookie ? "yes" : "no"),
      "has_sessionKey=" + (sessionKey ? "yes(" + sessionKey.length + " chars)" : "no"),
      "has_cf_clearance=" + (cfClearance ? "yes" : "no"),
      "cookie_names=" + (Object.keys(cookies).join(", ") || "none")
    ].join("\n");

    $persistentStore.write(debugInfo, DEBUG_KEY);

    if (sessionKey) {
      var result = saveKey(sessionKey, cookie);
      var data = {
        time: nowISO(),
        url: reqUrl,
        sessionKey: sessionKey,
        cfClearance: cfClearance,
        result: result
      };
      $persistentStore.write(JSON.stringify(data), STORE_KEY);

      if (result.added) {
        notify(
          "Claude sessionKey 已捕获",
          "新账号已追加",
          "账号数: " + result.count + "\nKey: " + mask(sessionKey) + "\n打开 http://claude-key.local/ 查看"
        );
      }
    } else if (DEBUG_NOTIFY) {
      notify(
        "Claude 脚本已触发，未找到 sessionKey",
        cookie ? "有 Cookie 但没找到 sessionKey" : "请求无 Cookie",
        "打开 http://claude-key.local/ 看 debug"
      );
    }

    $done({});
  }
} catch (e) {
  notify("Claude sessionKey 脚本错误", String(e), "");
  try { $persistentStore.write("error=" + String(e) + "\ntime=" + nowISO(), DEBUG_KEY); } catch (_) {}
  $done({});
}
