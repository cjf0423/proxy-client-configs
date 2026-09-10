/*
 * Tuyo KYC Bypass v2
 * 
 * 分析发现：新旧版后端数据完全一致（ETag 相同），
 * KYC 限制是 App 前端 1.26.57 新加的客户端检查。
 * 
 * 策略：
 * 1. 伪装旧版 App 版本号 (1.26.55) 欺骗前端逻辑
 * 2. 修改 account/verification 响应中的 KYC 状态为已完成
 * 3. 修改 banking/overview 中可能的 KYC 门控字段
 * 4. 移除缓存头确保拿到完整响应
 */

const url = $request.url;

// ===== 请求阶段 =====
if (typeof $response === "undefined") {
  let headers = Object.assign({}, $request.headers);

  // 移除缓存头 → 强制服务器返回完整 200
  delete headers["If-None-Match"];
  delete headers["if-none-match"];
  delete headers["If-Modified-Since"];
  delete headers["if-modified-since"];

  // 伪装旧版 App 版本号
  if (headers["X-App-Version"]) {
    headers["X-App-Version"] = headers["X-App-Version"]
      .replace(/1\.26\.57/, "1.26.55")
      .replace(/100121/, "100119")
      .replace(/01a08ade/, "01a01afb");
  }
  if (headers["x-app-version"]) {
    headers["x-app-version"] = headers["x-app-version"]
      .replace(/1\.26\.57/, "1.26.55")
      .replace(/100121/, "100119")
      .replace(/01a08ade/, "01a01afb");
  }
  // User-Agent 中的版本号也改
  if (headers["User-Agent"]) {
    headers["User-Agent"] = headers["User-Agent"].replace(/Tuyo\/100121/, "Tuyo/100119");
  }
  if (headers["user-agent"]) {
    headers["user-agent"] = headers["user-agent"].replace(/Tuyo\/100121/, "Tuyo/100119");
  }

  $done({ headers: headers });
}
// ===== 响应阶段 =====
else {
  let body = $response.body;

  if (body) {
    try {
      let obj = JSON.parse(body);
      let modified = false;

      // 深度遍历修改所有 KYC 相关字段
      let result = deepModifyKYC(obj, url);
      obj = result.obj;
      if (result.changed) modified = true;

      if (modified) {
        body = JSON.stringify(obj);
        console.log("[Tuyo] ✅ Modified: " + url.replace("https://api.tuyo.com", ""));
      }
    } catch (e) {
      // Not JSON, skip
    }
  }

  $done({ body: body });
}

function deepModifyKYC(obj, reqUrl) {
  var changed = false;
  if (typeof obj !== "object" || obj === null) return { obj: obj, changed: false };

  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      var r = deepModifyKYC(obj[i], reqUrl);
      obj[i] = r.obj;
      if (r.changed) changed = true;
    }
    return { obj: obj, changed: changed };
  }

  for (var key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    var val = obj[key];
    var lk = key.toLowerCase();

    // === 字符串状态字段 ===
    if (typeof val === "string") {
      // 各种 verification/kyc status
      if (
        lk === "verificationstatus" ||
        lk === "verification_status" ||
        lk === "kycstatus" ||
        lk === "kyc_status" ||
        lk === "identitystatus" ||
        lk === "identity_status"
      ) {
        if (val !== "completed" && val !== "verified" && val !== "approved") {
          obj[key] = "completed";
          changed = true;
        }
      }

      // 通用 status 字段在 verification 相关路径
      if (
        lk === "status" &&
        (reqUrl.includes("/verification") ||
          reqUrl.includes("/banking") ||
          reqUrl.includes("/fiat"))
      ) {
        var blocked = [
          "not_started",
          "pending",
          "in_progress",
          "in_review",
          "submitted",
          "rejected",
          "failed",
          "expired",
          "required",
          "action_needed",
          "verifying",
        ];
        if (blocked.indexOf(val.toLowerCase()) !== -1) {
          obj[key] = "completed";
          changed = true;
        }
      }

      // state 字段
      if (lk === "state" || lk === "kycstate" || lk === "kyc_state") {
        var blockedStates = [
          "not_started",
          "pending",
          "in_progress",
          "in_review",
          "action_needed",
          "verifying",
        ];
        if (blockedStates.indexOf(val.toLowerCase()) !== -1) {
          obj[key] = "completed";
          changed = true;
        }
      }
    }

    // === 布尔标志 ===
    if (typeof val === "boolean") {
      // 需要设为 false 的字段（"需要验证"类）
      if (
        (lk.includes("required") && (lk.includes("kyc") || lk.includes("verif") || lk.includes("identity"))) ||
        lk === "isrequired" ||
        lk === "is_required" ||
        lk === "kycneeded" ||
        lk === "kyc_needed" ||
        lk === "needsverification" ||
        lk === "needs_verification" ||
        lk === "needskyc" ||
        lk === "needs_kyc" ||
        lk === "requireskyc" ||
        lk === "requires_kyc" ||
        lk === "kycpending" ||
        lk === "kyc_pending" ||
        lk === "ismigrationrequired" ||
        lk === "is_migration_required" ||
        lk === "isbanned" ||
        lk === "is_banned"
      ) {
        if (val === true) {
          obj[key] = false;
          changed = true;
        }
      }

      // 需要设为 true 的字段（"已验证"类）
      if (
        lk === "isverified" ||
        lk === "is_verified" ||
        lk === "kycverified" ||
        lk === "kyc_verified" ||
        lk === "iscompleted" ||
        lk === "is_completed" ||
        lk === "isapproved" ||
        lk === "is_approved" ||
        lk === "isactive" ||
        lk === "is_active" ||
        lk === "identityverified" ||
        lk === "identity_verified"
      ) {
        if (val === false) {
          obj[key] = true;
          changed = true;
        }
      }
    }

    // === 递归 ===
    if (typeof val === "object" && val !== null) {
      var r2 = deepModifyKYC(val, reqUrl);
      obj[key] = r2.obj;
      if (r2.changed) changed = true;
    }
  }

  return { obj: obj, changed: changed };
}
