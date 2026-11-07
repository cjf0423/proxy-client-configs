/*
 * Google AI Pro Offer Injector — defensive Surge edition, v2.0.3
 * Original author: 小龙虾 🦞; defensive refactor: 小H.
 * Local transformation only: no network calls, no credentials/storage access.
 * A changed request is NOT evidence of an accepted offer or account eligibility.
 * Defaults retain the original layer (12m), but PRESERVE signature-related fields.
 * Optional $argument JSON: {"layer":"12m","debug":false,"clearSignature":false}
 * Layers: 12m / 6m_ss / 6m / 6m_2 / off. No automatic purchase or layer cycling.
 */
(function () {
  "use strict";
  var VERSION = "2.0.3";
  var DEFAULT_LAYER = "12m";
  var MAX_INPUT = 1048576;
  var PREFIX = "subs:com.google.android.apps.subscriptions.red:";
  // Values preserved verbatim from the user-supplied archive; validity not verified.
  var TOKENS = {
    "12m": "AVbCH/cspB8VdqKJ+ax/uPxUFAVuYRPX4iSjtg4Fu0PG9zUeURSM7y//LlQva1dCd/rbKVM6EJmyiG/C9BoQ95pMl8yDCHuiwCvM5CuGJME=",
    "6m_ss": "AVbCH/cgl4zvPT2Lqw95Gn+RYAJIVwFwi783i6uVprX7u3MCa5J4CcTXH5RABa5WjBrUoQnwf8vI10TNV7ktd26myIdxqIwGmNoJ5ofYNqpQ10RKoSvHs75wsfA=",
    "6m": "AVbCH/fUON3w8hpfeutprA3BMQwrBwYIB6Y8CSWi1isDCDswKUUhGQ3dluj5WXsNKOvr8K5UULBGrRsf4KlW1rHLz0fF3SvxQhBFRbBOHCA=",
    "6m_2": "AVbCH/cJ5SeHgkVRt+bdcrapx/aLSu2kbsBgMdI413zbllDNsNQoC/zVlG/Npbu55WlMzBwWPhUedIvZFDg7fw0CmCv/8DKj04IZ21pK7mrV/hh5"
  };
  var YT_FREE_TOK = "AVbCH/eW4Nfp8KBl0zlm7x9PhaiCvpnqwUuL2D8NFPBQgmM9+HuYS1h2xH5lLWU/BsBj775LK5GqK8UHKqoSzhDDz+PqP3paNesqLU0r9i6XCrYa";
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function fail(code) { throw new Error(code); }
  function arr(v) { return Array.isArray(v); }
  function log(message) {
    if (typeof console !== "undefined" && typeof console.log === "function") {
      console.log("[GAPT " + VERSION + "] " + message);
    }
  }
  function parseJSON(text, code) {
    try { return JSON.parse(text); } catch (_) { fail(code); }
  }
  function decodeForm(text) {
    try { return decodeURIComponent(text.replace(/\+/g, " ")); }
    catch (_) { fail("INVALID_PERCENT_ENCODING"); }
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function assignChanged(node, index, value) {
    if (JSON.stringify(node[index]) === JSON.stringify(value)) return 0;
    node[index] = clone(value);
    return 1;
  }
  // Portable UTF-8 Base64: no URL, URLSearchParams, atob, btoa, Buffer or WebView.
  function encode64(text, urlSafe, padded) {
    var bytes = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, function (_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes.charCodeAt(i);
      var hasB = i + 1 < bytes.length, hasC = i + 2 < bytes.length;
      var b = hasB ? bytes.charCodeAt(i + 1) : 0;
      var c = hasC ? bytes.charCodeAt(i + 2) : 0;
      out += B64.charAt(a >> 2) + B64.charAt(((a & 3) << 4) | (b >> 4));
      out += hasB ? B64.charAt(((b & 15) << 2) | (c >> 6)) : "=";
      out += hasC ? B64.charAt(c & 63) : "=";
    }
    if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_");
    return padded ? out : out.replace(/=+$/, "");
  }
  function decode64(value) {
    if (typeof value !== "string" || !value.length) fail("INVALID_BASE64");
    var hasURL = /[-_]/.test(value), hasStandard = /[+/]/.test(value);
    if (hasURL && hasStandard) fail("MIXED_BASE64_ALPHABET");
    var normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) fail("INVALID_BASE64");
    var raw = normalized.replace(/=+$/, "");
    if (raw.length % 4 === 1) fail("INVALID_BASE64_LENGTH");
    var canonical = raw;
    while (canonical.length % 4) canonical += "=";
    if (normalized.indexOf("=") >= 0 && normalized !== canonical) fail("INVALID_BASE64_PADDING");
    var escaped = "";
    for (var i = 0; i < canonical.length; i += 4) {
      var a = B64.indexOf(canonical.charAt(i));
      var b = B64.indexOf(canonical.charAt(i + 1));
      var c = B64.indexOf(canonical.charAt(i + 2));
      var d = B64.indexOf(canonical.charAt(i + 3));
      var bytes = [(a << 2) | (b >> 4)];
      if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
      if (d >= 0) bytes.push(((c & 3) << 6) | d);
      for (var j = 0; j < bytes.length; j++) escaped += "%" + ("0" + bytes[j].toString(16)).slice(-2);
    }
    var text;
    try { text = decodeURIComponent(escaped); } catch (_) { fail("INVALID_BASE64_UTF8"); }
    if (encode64(text, false, false) !== raw) fail("NONCANONICAL_BASE64");
    return { text: text, urlSafe: hasURL, padded: /=/.test(value) };
  }
  function findField(parts, key) {
    var found = -1;
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf("=");
      var name = eq < 0 ? parts[i] : parts[i].slice(0, eq);
      // Do not decode unrelated fields: preserve their original bytes.
      if (name !== key && name.indexOf("%") < 0) continue;
      if (decodeForm(name) !== key) continue;
      if (found >= 0) fail("DUPLICATE_" + key);
      if (eq < 0) fail("MISSING_FIELD_VALUE");
      found = i;
    }
    return found;
  }
  function patchMode(container, index) {
    var mode = container[index];
    if (mode === null || typeof mode === "undefined") return 0;
    if (!arr(mode)) fail("UNKNOWN_PURCHASE_MODE");
    // Preserve subscription ID and unrelated mode fields; never invent an ID.
    if (!arr(mode[5]) || !mode[5].length) return 0;
    if (typeof mode[5][0] !== "string" || !mode[5][0].length) fail("INVALID_SUBSCRIPTION_ID");
    return assignChanged(mode, 1, 5);
  }
  function patchNode(node, items) {
    if (!arr(node)) return { matched: 0, changed: 0 };
    var matched = 0, changed = 0;
    if (arr(node[12])) {
      matched++;
      changed += assignChanged(node, 12, items);
      changed += patchMode(node, 7);
    }
    if (arr(node[10]) && arr(node[10][0])) {
      matched++;
      changed += assignChanged(node, 10, [items]);
      var nested = arr(node[2]) && arr(node[2][2]) ? node[2][2] : null;
      if (nested && nested[8] !== null && typeof nested[8] !== "undefined") {
        if (!arr(nested[8])) fail("UNKNOWN_NESTED_ITEMS");
        changed += assignChanged(nested, 8, [items]);
      }
    }
    return { matched: matched, changed: changed };
  }
  function patchBody(request, items) {
    if (request.method !== "POST") return { reason: "NOT_POST" };
    if (typeof request.body !== "string" || !request.body.length) return { reason: "NO_TEXT_BODY" };
    if (request.body.length > MAX_INPUT) return { reason: "INPUT_TOO_LARGE" };
    var headers = request.headers || {};
    var contentType = "";
    for (var h in headers) {
      if (!Object.prototype.hasOwnProperty.call(headers, h)) continue;
      var lower = h.toLowerCase();
      if (lower === "content-type") contentType = String(headers[h]).toLowerCase();
      if (lower === "expect" || lower === "transfer-encoding") return { reason: "UNSUPPORTED_FRAMING" };
      if (lower === "content-encoding" && String(headers[h]).toLowerCase() !== "identity") return { reason: "ENCODED_BODY" };
    }
    if (contentType && contentType.split(";")[0].trim() !== "application/x-www-form-urlencoded") return { reason: "UNEXPECTED_CONTENT_TYPE" };
    var parts = request.body.split("&"), index = findField(parts, "f.req");
    if (index < 0) return { reason: "NO_F_REQ" };
    var eq = parts[index].indexOf("=");
    var outer = parseJSON(decodeForm(parts[index].slice(eq + 1)), "INVALID_OUTER_JSON");
    if (!arr(outer)) fail("UNKNOWN_BATCH_STRUCTURE");
    var matched = 0, changed = 0;
    // All work is on parsed copies. Any failure discards the entire request edit.
    for (var g = 0; g < outer.length; g++) {
      if (!arr(outer[g])) continue;
      for (var c = 0; c < outer[g].length; c++) {
        var call = outer[g][c];
        if (!arr(call) || call[0] !== "Ngbm") continue;
        if (typeof call[1] !== "string") fail("INVALID_RPC_PAYLOAD");
        var payload = parseJSON(call[1], "INVALID_RPC_JSON");
        if (!arr(payload)) fail("UNKNOWN_RPC_STRUCTURE");
        var callChanged = 0;
        for (var n = 0; n < 2; n++) {
          var result = patchNode(payload[n], items);
          matched += result.matched;
          callChanged += result.changed;
        }
        if (callChanged) call[1] = JSON.stringify(payload);
        changed += callChanged;
      }
    }
    if (!changed) return { reason: matched ? "ALREADY_MATCHES" : "NO_SUPPORTED_ITEMS" };
    parts[index] = parts[index].slice(0, eq + 1) + encodeURIComponent(JSON.stringify(outer));
    var body = parts.join("&");
    if (body.length > MAX_INPUT) fail("OUTPUT_TOO_LARGE");
    // Leave framing headers to Surge; do not copy a stale Content-Length.
    return { output: { body: body }, locations: matched, changed: changed, route: "POST" };
  }
  function patchURL(request, items, config) {
    if (request.url.length > MAX_INPUT) return { reason: "INPUT_TOO_LARGE" };
    var hashAt = request.url.indexOf("#");
    var fragment = hashAt < 0 ? "" : request.url.slice(hashAt);
    var base = hashAt < 0 ? request.url : request.url.slice(0, hashAt);
    var q = base.indexOf("?");
    if (q < 0) return { reason: "NO_QUERY" };
    var parts = base.slice(q + 1).split("&"), index = findField(parts, "ear");
    if (index < 0) return { reason: "NO_EAR" };
    var eq = parts[index].indexOf("=");
    var ear = parseJSON(decodeForm(parts[index].slice(eq + 1)), "INVALID_EAR_JSON");
    if (!arr(ear)) fail("UNKNOWN_EAR_STRUCTURE");
    var matched = 0, changed = 0;
    if (ear[13] !== null && typeof ear[13] !== "undefined") {
      if (!arr(ear[13]) || (ear[13].length && !arr(ear[13][0]))) fail("UNKNOWN_OUTER_ITEMS");
      matched++;
      changed += assignChanged(ear[13], 0, items);
    }
    if (ear[4] !== null && typeof ear[4] !== "undefined") {
      if (!arr(ear[4]) || typeof ear[4][0] !== "string") fail("UNKNOWN_INNER_CONTAINER");
      var decoded = decode64(ear[4][0]);
      var inner = parseJSON(decoded.text, "INVALID_INNER_JSON");
      // Match the original Chrome guard: slot 8 need not already be an array.
      // Fixed type/length metadata only; never emit payload values or keys.
      var innerKind = inner === null ? "null" : (arr(inner) ? "array" : typeof inner);
      var slotKind = !arr(inner) ? "n/a" : (inner[8] === null ? "null" : (arr(inner[8]) ? "array" : typeof inner[8]));
      if (!arr(inner)) {
        log("内层结构：kind=" + innerKind + "; length=n/a; slot8=n/a");
        fail("UNKNOWN_INNER_ITEMS");
      }
      if (inner.length <= 8) {
        // The original Chrome code leaves this short optional container untouched.
        // Do NOT extend it or search arbitrary descendants for an offer location.
        log("跳过可选内层：kind=array; length=" + inner.length + "; 保留原编码；继续检查外层商品");
      } else {
        if (!arr(inner[8])) log("Chrome兼容结构：kind=array; length=" + inner.length + "; slot8=" + slotKind);
        matched++;
        if (assignChanged(inner, 8, [items])) {
          ear[4][0] = encode64(JSON.stringify(inner), decoded.urlSafe, decoded.padded);
          changed++;
        }
      }
    }
    if (!matched) return { reason: "NO_SUPPORTED_ITEMS" };
    changed += patchMode(ear, 8);
    // Compatibility option only. Nulling a field CANNOT disable server validation.
    if (config.clearSignature && ear.length > 24) changed += assignChanged(ear, 24, null);
    if (!changed) return { reason: "ALREADY_MATCHES" };
    parts[index] = parts[index].slice(0, eq + 1) + encodeURIComponent(JSON.stringify(ear));
    var url = base.slice(0, q + 1) + parts.join("&") + fragment;
    if (url.length > MAX_INPUT) fail("OUTPUT_TOO_LARGE");
    return { output: { url: url }, locations: matched, changed: changed, route: "URL" };
  }
  function configFromArgument() {
    var config = { layer: DEFAULT_LAYER, debug: false, clearSignature: false };
    if (typeof $argument === "undefined" || $argument === "") return config;
    if (typeof $argument !== "string") fail("INVALID_ARGUMENT");
    var value = parseJSON($argument, "INVALID_ARGUMENT_JSON");
    if (!value || typeof value !== "object" || arr(value)) fail("INVALID_ARGUMENT");
    var allowed = { layer: true, debug: true, clearSignature: true };
    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(allowed, key)) fail("UNKNOWN_ARGUMENT_KEY");
      if (typeof value[key] !== typeof config[key]) fail("INVALID_ARGUMENT_TYPE");
      config[key] = value[key];
    }
    return config;
  }

  var output = {};
  try {
    var config = configFromArgument();
    if (config.layer === "off") {
      if (config.debug) log("跳过：OFF");
    } else {
      if (!Object.prototype.hasOwnProperty.call(TOKENS, config.layer)) fail("INVALID_LAYER");
      var request = typeof $request === "undefined" ? null : $request;
      if (!request || typeof request.url !== "string") fail("MISSING_REQUEST");
      var items = [
        [[PREFIX + "g1.2tb.ai.subs_variant", 21], null, null, null, 1, [TOKENS[config.layer]]],
        [[PREFIX + "g1.youtube_premium_individual_add_on", 21], null, null, null, 1, [YT_FREE_TOK]]
      ];
      var result;
      if (/^https:\/\/one\.google\.com\/_\/SubscriptionsUi\/data\/batchexecute(?:[?#]|$)/.test(request.url)) {
        result = patchBody(request, items);
      } else if (/^https:\/\/(?:play|tokenized\.play)\.google\.com\/(?:[^?#]*\/)?eacquire\/multiline(?:[?#]|$)/.test(request.url)) {
        if (request.method !== "GET" && request.method !== "POST") result = { reason: "UNSUPPORTED_METHOD" };
        else result = patchURL(request, items, config);
      } else result = { reason: "OUT_OF_SCOPE" };
      if (result.output) {
        log("已改写请求 " + result.route + "；layer=" + config.layer + "；位置=" + result.locations + "；字段变化=" + result.changed + "。未验证服务端优惠。");
        output = result.output;
      } else if (config.debug) log("原样放行：" + result.reason);
    }
  } catch (error) {
    // Only log our fixed error codes. Never log URLs, request bodies, IDs or tokens.
    var code = error && typeof error.message === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.message) ? error.message : "UNEXPECTED_ERROR";
    log("原样放行：" + code);
    output = {};
  }
  // Exactly one call, outside try/catch (Surge terminates the context at $done).
  $done(output);
}());
