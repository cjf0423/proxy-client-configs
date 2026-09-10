/*
 * Tuyo KYC Bypass v3
 * 
 * 经过新旧版完整抓包对比确认：
 * 后端数据完全一致，KYC 限制 100% 是 App 前端 1.26.57 的客户端逻辑。
 * App 读取 /account/verification 的 status 字段决定是否显示验证页面。
 * 
 * 精准修改：
 * 1. /account/verification → status: "completed", 所有 provider verified: true
 * 2. /account/connect → verificationStatus: "completed"
 * 3. /account/verification/providers/* → 相应 provider 状态改为已验证
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
// ===== 响应阶段：精准修改 KYC 字段 =====
else {
  let body = $response.body;

  if (!body) {
    $done({});
    return;
  }

  try {
    let obj = JSON.parse(body);
    let modified = false;
    let endpoint = url.replace("https://api.tuyo.com", "").split("?")[0];

    // ——— /account/verification ———
    // 原始: {"status":"not_started","serviceProviders":{"bridgeXYZ":{"verified":true},"raincards":{"verified":false},"stripe":{"verified":false,...}},"requirements":[...],"dataRemediations":[]}
    // 改为: status → completed, 所有 provider verified → true, 清空 requirements
    if (endpoint === "/account/verification") {
      if (obj.status && obj.status !== "completed") {
        obj.status = "completed";
        modified = true;
      }
      // 把所有 service provider 设为已验证
      if (obj.serviceProviders) {
        for (var provider in obj.serviceProviders) {
          var p = obj.serviceProviders[provider];
          if (p.verified === false) {
            p.verified = true;
            modified = true;
          }
          if (p.active === false) {
            p.active = true;
            modified = true;
          }
          if (p.hasIssue === true) {
            p.hasIssue = false;
            modified = true;
          }
        }
      }
      // 清空验证需求列表
      if (obj.requirements && obj.requirements.length > 0) {
        obj.requirements = [];
        modified = true;
      }
      if (obj.dataRemediations && obj.dataRemediations.length > 0) {
        obj.dataRemediations = [];
        modified = true;
      }
    }

    // ——— /account/verification/providers/raincard ———
    if (endpoint.includes("/verification/providers/")) {
      if (typeof obj.verified !== "undefined" && obj.verified === false) {
        obj.verified = true;
        modified = true;
      }
      if (typeof obj.active !== "undefined" && obj.active === false) {
        obj.active = true;
        modified = true;
      }
      if (typeof obj.status === "string") {
        var blocked = ["not_started", "pending", "in_progress", "in_review", "submitted", "rejected", "failed", "expired", "required", "action_needed", "verifying"];
        if (blocked.indexOf(obj.status.toLowerCase()) !== -1) {
          obj.status = "completed";
          modified = true;
        }
      }
    }

    // ——— /account/connect ———
    // 原始: verificationStatus: "not_started"
    // 改为: "completed"
    if (endpoint === "/account/connect") {
      if (obj.verificationStatus && obj.verificationStatus !== "completed") {
        obj.verificationStatus = "completed";
        modified = true;
      }
      if (obj.isMigrationRequired === true) {
        obj.isMigrationRequired = false;
        modified = true;
      }
      if (obj.isBanned === true) {
        obj.isBanned = false;
        modified = true;
      }
    }

    if (modified) {
      body = JSON.stringify(obj);
      console.log("[Tuyo] ✅ Modified: " + endpoint);
    }
  } catch (e) {
    // Not JSON, pass through
  }

  $done({ body: body });
}
