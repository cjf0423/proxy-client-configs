/*
 * Tuyo KYC Bypass v6
 * 
 * 经 Hermes bytecode 逆向分析发现:
 * - App 检查 isL1Verified, verificationGraceActive, shouldShowVerificationCard
 * - hasLegacyVerification 也是一个条件
 * - status 值 not_started/completed/approved/active/verified 都被映射到不同的审核页面
 * 
 * 新策略: 在所有相关响应中注入 grace/legacy 标志，
 * 同时将 requirements 清空并设置所有可能的通过状态
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
      // 设置所有可能的通过标识
      obj.status = "approved";
      obj.verificationGraceActive = true;
      obj.isL1Verified = true;
      obj.hasLegacyVerification = true;
      obj.shouldShowVerificationCard = false;
      obj.isVerified = true;
      obj.kycCompleted = true;
      
      if (obj.serviceProviders) {
        for (var provider in obj.serviceProviders) {
          var p = obj.serviceProviders[provider];
          p.verified = true;
          p.active = true;
          p.hasIssue = false;
          if (p.hasCryptoCustomerId !== undefined) {
            p.hasCryptoCustomerId = true;
          }
        }
      }
      obj.requirements = [];
      obj.dataRemediations = [];
      modified = true;
    }

    // ——— /account/verification/providers/raincard ———
    if (endpoint === "/account/verification/providers/raincard") {
      obj = {
        "status": "active",
        "eligible": false,
        "isUSPerson": false,
        "reason": "User is already verified with the provider.",
        "verificationPendingStalled": false
      };
      modified = true;
    }

    // ——— /account/verification/providers/bridge ———
    if (endpoint === "/account/verification/providers/bridge") {
      obj.status = "active";
      obj.eligible = false;
      obj.reason = "User is already verified with the provider.";
      obj.verificationPendingStalled = false;
      modified = true;
    }

    // ——— /account/connect ———
    if (endpoint === "/account/connect") {
      obj.verificationStatus = "approved";
      obj.isMigrationRequired = false;
      obj.isBanned = false;
      obj.isL1Verified = true;
      obj.verificationGraceActive = true;
      obj.hasLegacyVerification = true;
      modified = true;
    }

    // ——— /banking/overview ———
    if (endpoint === "/banking/overview") {
      if (obj.accounts && Array.isArray(obj.accounts)) {
        for (var i = 0; i < obj.accounts.length; i++) {
          obj.accounts[i].status = "active";
        }
      }
      // 注入验证通过标识
      obj.verificationGraceActive = true;
      obj.isL1Verified = true;
      obj.hasLegacyVerification = true;
      modified = true;
    }

    if (modified) {
      body = JSON.stringify(obj);
      console.log("[Tuyo] ✅ Modified: " + endpoint);
    }
  } catch (e) {}

  $done({ body: body });
}
