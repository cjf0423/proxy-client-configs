/*
 * Tuyo KYC Bypass v4
 * 
 * v3 已证明脚本在生效（从 "Action needed" 变成了 "Verifying"），
 * 说明 "completed" 不是最终态。尝试 "verified" 并补全所有子字段。
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
// ===== 响应阶段 =====
else {
  let body = $response.body;
  if (!body) { $done({}); return; }

  try {
    let obj = JSON.parse(body);
    let modified = false;
    let endpoint = url.replace("https://api.tuyo.com", "").split("?")[0];

    // ——— /account/verification ———
    if (endpoint === "/account/verification") {
      // "not_started" → 需要KYC, "completed" → 审核中, 试 "approved"
      obj.status = "approved";
      
      if (obj.serviceProviders) {
        for (var provider in obj.serviceProviders) {
          var p = obj.serviceProviders[provider];
          p.verified = true;
          p.active = true;
          p.hasIssue = false;
          // Stripe 专属字段
          if (provider === "stripe" || p.hasCryptoCustomerId !== undefined) {
            p.hasCryptoCustomerId = true;
            p.instantDepositsEnabled = true;
          }
        }
      }
      obj.requirements = [];
      obj.dataRemediations = [];
      modified = true;
    }

    // ——— /account/verification/providers/* ———
    if (endpoint.includes("/verification/providers/")) {
      obj.verified = true;
      obj.active = true;
      obj.hasIssue = false;
      if (obj.hasCryptoCustomerId !== undefined) {
        obj.hasCryptoCustomerId = true;
      }
      if (obj.status) {
        obj.status = "approved";
      }
      modified = true;
    }

    // ——— /account/connect ———
    if (endpoint === "/account/connect") {
      obj.verificationStatus = "approved";
      obj.isMigrationRequired = false;
      obj.isBanned = false;
      modified = true;
    }

    // ——— /banking/overview ———
    // 确保银行账户状态为 active
    if (endpoint === "/banking/overview") {
      if (obj.accounts && Array.isArray(obj.accounts)) {
        for (var i = 0; i < obj.accounts.length; i++) {
          if (obj.accounts[i].status !== "active") {
            obj.accounts[i].status = "active";
            modified = true;
          }
        }
      }
      // 如果有顶层 verification 相关字段
      if (obj.verificationStatus) {
        obj.verificationStatus = "approved";
        modified = true;
      }
      if (obj.kycStatus) {
        obj.kycStatus = "approved";
        modified = true;
      }
    }

    if (modified) {
      body = JSON.stringify(obj);
      console.log("[Tuyo] ✅ Modified: " + endpoint);
    }
  } catch (e) {}

  $done({ body: body });
}
