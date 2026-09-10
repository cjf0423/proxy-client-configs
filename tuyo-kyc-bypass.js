/*
 * Tuyo KYC Bypass v5
 * 
 * 关键发现：
 * - providers/bridge 返回 {"status":"active","eligible":false,"reason":"User is already verified"}
 * - providers/raincard 返回 {"status":"not_started","eligible":true}
 * - 主 verification 接口的 serviceProviders.bridgeXYZ 已通过 (verified:true,active:true)
 * - 但 raincards 未通过 (verified:false,active:false)
 * 
 * App 检查 raincards provider 的状态来决定是否显示 IBAN/转账页面。
 * 需要把 raincards 的状态伪装成和 bridge 一样的"已通过"。
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
      // 主状态设为 active（和 bridge provider 一致）
      obj.status = "active";

      if (obj.serviceProviders) {
        // 把所有 provider 都设为已通过（和 bridgeXYZ 一致）
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
      // 清空验证需求
      obj.requirements = [];
      obj.dataRemediations = [];
      modified = true;
    }

    // ——— /account/verification/providers/raincard ———
    // 原始: {"status":"not_started","eligible":true,"isUSPerson":false,"verificationPendingStalled":false}
    // 改为和 bridge 一致: {"status":"active","eligible":false,"reason":"User is already verified with the provider.","verificationPendingStalled":false}
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
    // 这个已经是 active，但确保一下
    if (endpoint === "/account/verification/providers/bridge") {
      obj.status = "active";
      obj.verificationPendingStalled = false;
      modified = true;
    }

    // ——— /account/connect ———
    if (endpoint === "/account/connect") {
      obj.verificationStatus = "active";
      obj.isMigrationRequired = false;
      obj.isBanned = false;
      modified = true;
    }

    // ——— /banking/overview ———
    if (endpoint === "/banking/overview") {
      if (obj.accounts && Array.isArray(obj.accounts)) {
        for (var i = 0; i < obj.accounts.length; i++) {
          obj.accounts[i].status = "active";
        }
      }
      modified = true;
    }

    if (modified) {
      body = JSON.stringify(obj);
      console.log("[Tuyo] ✅ Modified: " + endpoint);
    }
  } catch (e) {}

  $done({ body: body });
}
