/*
 * Tuyo KYC Bypass v8 (finding minimum)
 * 
 * v6 能用，v7(仅 verificationGraceActive) 不行
 * 测试: verificationGraceActive + status + requirements清空 + providers改通过
 * 不改 /account/connect 和 /banking/overview
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
      obj.requirements = [];
      obj.dataRemediations = [];
      if (obj.serviceProviders) {
        for (var p in obj.serviceProviders) {
          obj.serviceProviders[p].verified = true;
          obj.serviceProviders[p].active = true;
          obj.serviceProviders[p].hasIssue = false;
        }
      }
      body = JSON.stringify(obj);
      console.log("[Tuyo] ✅ Modified verification");
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
      console.log("[Tuyo] ✅ Modified raincard");
    }
  } catch (e) {}

  $done({ body: body });
}
