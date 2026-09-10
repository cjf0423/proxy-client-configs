/*
 * Tuyo KYC Bypass v7 (minimal)
 * 
 * 最小改动：仅在 /account/verification 响应中注入 verificationGraceActive: true
 * 让 App 认为处于宽限期，跳过 KYC 验证页面直接显示 IBAN
 */

const url = $request.url;

if (typeof $response === "undefined") {
  // 请求阶段：移除缓存头
  let headers = Object.assign({}, $request.headers);
  delete headers["If-None-Match"];
  delete headers["if-none-match"];
  delete headers["If-Modified-Since"];
  delete headers["if-modified-since"];
  $done({ headers: headers });
} else {
  // 响应阶段
  let body = $response.body;
  if (!body) { $done({}); return; }

  try {
    let obj = JSON.parse(body);
    let endpoint = url.replace("https://api.tuyo.com", "").split("?")[0];

    if (endpoint === "/account/verification") {
      obj.verificationGraceActive = true;
      body = JSON.stringify(obj);
      console.log("[Tuyo] ✅ Injected verificationGraceActive");
    }
  } catch (e) {}

  $done({ body: body });
}
