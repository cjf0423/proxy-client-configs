/*
 * Tuyo KYC Bypass v9
 * v8(verification+raincard)不行 → 加回 /account/connect
 */

const url = $request.url;

if (typeof $response === "undefined") {
  let headers = Object.assign({}, $request.headers);
  delete headers["If-None-Match"];
  delete headers["if-none-match"];
  delete headers["If-Modified-Since"];
  delete headers["if-modified-since"];
  $done({ headers: headers });
} else {
  let body = $response.body;
  if (!body) { $done({}); return; }

  try {
    let obj = JSON.parse(body);
    let endpoint = url.replace("https://api.tuyo.com", "").split("?")[0];

    if (endpoint === "/account/verification") {
      obj.status = "approved";
      obj.verificationGraceActive = true;
      obj.isL1Verified = true;
      obj.hasLegacyVerification = true;
      obj.shouldShowVerificationCard = false;
      obj.isVerified = true;
      obj.kycCompleted = true;
      obj.requirements = [];
      obj.dataRemediations = [];
      if (obj.serviceProviders) {
        for (var p in obj.serviceProviders) {
          obj.serviceProviders[p].verified = true;
          obj.serviceProviders[p].active = true;
          obj.serviceProviders[p].hasIssue = false;
          if (obj.serviceProviders[p].hasCryptoCustomerId !== undefined) {
            obj.serviceProviders[p].hasCryptoCustomerId = true;
          }
        }
      }
      body = JSON.stringify(obj);
    }

    if (endpoint === "/account/verification/providers/raincard") {
      obj = {
        "status": "active",
        "eligible": false,
        "isUSPerson": false,
        "reason": "User is already verified with the provider.",
        "verificationPendingStalled": false
      };
      body = JSON.stringify(obj);
    }

    if (endpoint === "/account/verification/providers/bridge") {
      obj.status = "active";
      obj.eligible = false;
      obj.reason = "User is already verified with the provider.";
      obj.verificationPendingStalled = false;
      body = JSON.stringify(obj);
    }

    if (endpoint === "/account/connect") {
      obj.verificationStatus = "approved";
      obj.isMigrationRequired = false;
      obj.isBanned = false;
      obj.isL1Verified = true;
      obj.verificationGraceActive = true;
      obj.hasLegacyVerification = true;
      body = JSON.stringify(obj);
    }
  } catch (e) {}

  $done({ body: body });
}
