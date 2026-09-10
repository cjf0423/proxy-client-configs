/*
 * Tuyo KYC Bypass
 * 绕过 Tuyo 新版 KYC 验证，恢复转账功能
 * 
 * 原理：
 * 1. 请求阶段：移除 If-None-Match / If-Modified-Since 缓存头
 *    → 强制服务器返回完整 200 响应（而非 304 空包）
 * 2. 响应阶段：将所有 KYC/verification 状态字段改为已完成
 */

const url = $request.url;

// ===== 请求阶段：移除缓存头 =====
if (typeof $response === "undefined") {
  let headers = Object.assign({}, $request.headers);
  delete headers["If-None-Match"];
  delete headers["if-none-match"];
  delete headers["If-Modified-Since"];
  delete headers["if-modified-since"];
  $done({ headers: headers });
}
// ===== 响应阶段：修改 KYC 相关字段 =====
else {
  let body = $response.body;

  if (body) {
    try {
      let obj = JSON.parse(body);
      let modified = false;

      // 1. /account/connect — 核心身份接口
      if (url.includes("/account/connect")) {
        if (obj.verificationStatus && obj.verificationStatus !== "completed") {
          obj.verificationStatus = "completed";
          modified = true;
        }
        obj.isBanned = false;
        obj.isMigrationRequired = false;
      }

      // 2. 通用深度修改所有验证相关字段
      let result = deepModifyKYC(obj);
      obj = result.obj;
      if (result.changed) modified = true;

      if (modified) {
        body = JSON.stringify(obj);
        console.log(
          "[Tuyo] ✅ Modified: " + url.replace("https://api.tuyo.com", "")
        );
      }
    } catch (e) {
      console.log("[Tuyo] ⚠️ Parse error: " + e.message);
    }
  }

  $done({ body: body });
}

// ===== 深度遍历修改 KYC 字段 =====
function deepModifyKYC(obj) {
  var changed = false;

  if (typeof obj !== "object" || obj === null) {
    return { obj: obj, changed: false };
  }

  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      var r = deepModifyKYC(obj[i]);
      obj[i] = r.obj;
      if (r.changed) changed = true;
    }
    return { obj: obj, changed: changed };
  }

  for (var key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    var val = obj[key];
    var lk = key.toLowerCase();

    // —— 字符串状态字段 → completed ——
    if (typeof val === "string") {
      // verificationStatus / kycStatus 等
      if (
        lk.includes("verificationstatus") ||
        lk.includes("verification_status") ||
        lk.includes("kycstatus") ||
        lk.includes("kyc_status")
      ) {
        if (
          val !== "completed" &&
          val !== "verified" &&
          val !== "approved"
        ) {
          obj[key] = "completed";
          changed = true;
        }
      }
      // verification 路径下的通用 status 字段
      if (lk === "status" && url.includes("/verification")) {
        var blocked = [
          "not_started",
          "pending",
          "in_progress",
          "submitted",
          "rejected",
          "failed",
          "expired",
          "required",
        ];
        if (blocked.indexOf(val.toLowerCase()) !== -1) {
          obj[key] = "completed";
          changed = true;
        }
      }
    }

    // —— 布尔标志字段 ——
    if (typeof val === "boolean") {
      // "需要KYC" → false
      var needFalse = [
        "isrequired",
        "is_required",
        "kycneeded",
        "kyc_needed",
        "needsverification",
        "needs_verification",
        "needskyc",
        "needs_kyc",
        "requireskyc",
        "requires_kyc",
        "kycrequired",
        "kyc_required",
        "verificationrequired",
        "verification_required",
      ];
      if (needFalse.indexOf(lk) !== -1 && val === true) {
        obj[key] = false;
        changed = true;
      }
      // 含 "required" 且含 "kyc/verif" 的复合字段
      if (
        lk.includes("required") &&
        (lk.includes("kyc") || lk.includes("verif"))
      ) {
        if (val === true) {
          obj[key] = false;
          changed = true;
        }
      }
      // "已验证" → true
      var needTrue = [
        "isverified",
        "is_verified",
        "kycverified",
        "kyc_verified",
        "iscompleted",
        "is_completed",
        "isapproved",
        "is_approved",
      ];
      if (needTrue.indexOf(lk) !== -1 && val === false) {
        obj[key] = true;
        changed = true;
      }
    }

    // —— 递归嵌套对象 ——
    if (typeof val === "object" && val !== null) {
      var r2 = deepModifyKYC(val);
      obj[key] = r2.obj;
      if (r2.changed) changed = true;
    }
  }

  return { obj: obj, changed: changed };
}
