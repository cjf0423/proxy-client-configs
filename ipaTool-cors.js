/**
 * ipaTool CORS 修复
 * 为 apple-api.com 的响应添加 CORS 头，
 * 允许从 GitHub Pages 页面跨域调用 API
 */
if ($request.method === 'OPTIONS') {
  // OPTIONS 预检请求：直接返回 204 + CORS 头
  $done({
    response: {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      },
      body: ''
    }
  });
} else {
  // 普通请求：给现有响应追加 CORS 头
  const headers = $response.headers || {};
  headers['Access-Control-Allow-Origin'] = '*';
  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';
  $done({ headers });
}
