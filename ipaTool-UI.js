/**
 * ipaTool Web 操作面板
 * 作者: 小H
 * 说明: 拦截 https://ipatool-ui.com 请求
 *       /api/* 路径转发到 apple-api.com（解决跨域问题）
 *       其他路径返回可视化操作网页
 *       在 Safari 中打开 https://ipatool-ui.com 即可使用
 */

const url = $request.url;
const path = url.replace(/^https?:\/\/ipatool-ui\.com/, '') || '/';

// ===== API 代理转发 =====
if (path.startsWith('/api/')) {
  const apiPath = path.replace('/api', '');
  const targetUrl = 'https://apple-api.com' + apiPath;
  const method = $request.method || 'GET';
  const headers = Object.assign({}, $request.headers || {});
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';

  const opts = { url: targetUrl, headers };
  if ($request.body) opts.body = $request.body;

  const cb = (err, resp, data) => {
    if (err) {
      $done({
        response: {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: false, message: 'Proxy error: ' + err })
        }
      });
      return;
    }
    $done({
      response: {
        status: resp.status || 200,
        headers: Object.assign(resp.headers || {}, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }),
        body: data
      }
    });
  };

  if (method === 'POST') {
    $httpClient.post(opts, cb);
  } else {
    $httpClient.get(opts, cb);
  }

// ===== OPTIONS preflight =====
} else if ($request.method === 'OPTIONS') {
  $done({
    response: {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    }
  });

// ===== 返回 HTML 页面 =====
} else {

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ipaTool</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#e6edf3;--text2:#8b949e;--blue:#58a6ff;--green:#3fb950;--red:#f85149;--orange:#d29922;--radius:12px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:16px;padding-bottom:80px}
h1{font-size:22px;text-align:center;padding:16px 0 8px;display:flex;align-items:center;justify-content:center;gap:8px}
.status-bar{text-align:center;padding:6px;margin-bottom:16px;font-size:13px;color:var(--text2);background:var(--card);border-radius:8px;border:1px solid var(--border)}
.status-bar .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dot.on{background:var(--green)}.dot.off{background:var(--red)}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px}
.card h2{font-size:15px;color:var(--blue);margin-bottom:12px;display:flex;align-items:center;gap:6px}
.field{margin-bottom:12px}
.field label{display:block;font-size:13px;color:var(--text2);margin-bottom:4px}
.field input,.field select{width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:15px;outline:none;-webkit-appearance:none}
.field input:focus,.field select:focus{border-color:var(--blue)}
.field input::placeholder{color:#484f58}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
.btn{flex:1;min-width:0;padding:10px 0;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s;-webkit-tap-highlight-color:transparent}
.btn:active{opacity:.7}
.btn-blue{background:var(--blue);color:#0d1117}
.btn-green{background:var(--green);color:#0d1117}
.btn-orange{background:var(--orange);color:#0d1117}
.btn-red{background:var(--red);color:#fff}
.btn-gray{background:var(--border);color:var(--text)}
.btn:disabled{opacity:.4;cursor:not-allowed}
#result-box{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow-y:auto;color:var(--text2)}
.app-item{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;transition:border-color .2s;-webkit-tap-highlight-color:transparent}
.app-item:active{border-color:var(--blue)}
.app-item .name{font-size:15px;font-weight:600;color:var(--text)}
.app-item .meta{font-size:12px;color:var(--text2);margin-top:4px}
.app-item .id-tag{display:inline-block;background:var(--border);color:var(--blue);font-size:11px;padding:2px 6px;border-radius:4px;margin-top:4px;font-family:monospace}
.ver-item{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-bottom:6px}
.ver-item .ver-info{flex:1;min-width:0}
.ver-item .ver-name{font-size:14px;font-weight:500}
.ver-item .ver-meta{font-size:12px;color:var(--text2);margin-top:2px}
.ver-item .btn{flex:none;width:auto;padding:6px 14px;font-size:13px;margin-left:8px}
.loading{text-align:center;padding:20px;color:var(--text2)}
.loading::after{content:'';display:inline-block;width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite;margin-left:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.toast{position:fixed;top:60px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;font-size:14px;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;max-width:90%}
.toast.show{opacity:1}
.toast.success{background:var(--green);color:#0d1117}
.toast.error{background:var(--red);color:#fff}
.toast.info{background:var(--blue);color:#0d1117}
.tab-bar{display:flex;gap:4px;margin-bottom:16px;background:var(--card);border-radius:10px;padding:4px;border:1px solid var(--border)}
.tab{flex:1;text-align:center;padding:8px 0;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);transition:all .2s;-webkit-tap-highlight-color:transparent}
.tab.active{background:var(--blue);color:#0d1117}
.page{display:none}.page.active{display:block}
</style>
</head>
<body>

<h1>📱 ipaTool</h1>
<div class="status-bar" id="statusBar"><span class="dot off"></span>未登录</div>

<div class="tab-bar">
  <div class="tab active" onclick="switchTab('login')">🔐 登录</div>
  <div class="tab" onclick="switchTab('search')">🔍 搜索</div>
  <div class="tab" onclick="switchTab('versions')">📜 版本</div>
  <div class="tab" onclick="switchTab('result')">📋 结果</div>
</div>

<!-- 登录页 -->
<div class="page active" id="page-login">
  <div class="card">
    <h2>🔐 Apple ID 登录</h2>
    <div class="field">
      <label>Apple ID</label>
      <input type="email" id="appleId" placeholder="your@icloud.com" autocomplete="username">
    </div>
    <div class="field">
      <label>密码</label>
      <input type="password" id="password" placeholder="Apple ID 密码" autocomplete="current-password">
    </div>
    <div class="field" id="codeField" style="display:none">
      <label>双重验证码</label>
      <input type="text" id="code" placeholder="6位验证码" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
    </div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="doLogin()">登录</button>
      <button class="btn btn-gray" onclick="doRefresh()">刷新</button>
      <button class="btn btn-red" onclick="doReset()">重置</button>
    </div>
  </div>
</div>

<!-- 搜索页 -->
<div class="page" id="page-search">
  <div class="card">
    <h2>🔍 搜索应用</h2>
    <div class="field">
      <label>关键词</label>
      <input type="text" id="searchTerm" placeholder="输入应用名称" enterkeyhint="search"
             onkeydown="if(event.key==='Enter')doSearch()">
    </div>
    <div class="btn-row" style="margin-bottom:12px">
      <select id="country" style="flex:0 0 80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px">
        <option value="CN">🇨🇳 CN</option><option value="US">🇺🇸 US</option><option value="JP">🇯🇵 JP</option>
        <option value="HK">🇭🇰 HK</option><option value="TW">TW</option><option value="GB">🇬🇧 GB</option><option value="KR">🇰🇷 KR</option>
      </select>
      <button class="btn btn-blue" onclick="doSearch()">搜索</button>
    </div>
  </div>
  <div id="searchResults"></div>
</div>

<!-- 版本页 -->
<div class="page" id="page-versions">
  <div class="card">
    <h2>📜 应用版本</h2>
    <div class="field">
      <label>应用 ID</label>
      <input type="text" id="appId" placeholder="从搜索结果中点击获取" inputmode="numeric">
    </div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="doVersions()">查看版本</button>
      <button class="btn btn-green" onclick="doPurchase()">购买应用</button>
    </div>
  </div>
  <div id="versionResults"></div>
</div>

<!-- 结果页 -->
<div class="page" id="page-result">
  <div class="card">
    <h2>📋 操作结果</h2>
    <div id="result-box">等待操作...</div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
// API 通过同域 /api/ 代理转发到 apple-api.com，避免跨域问题
const API = '/api';

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    const pages = ['login','search','versions','result'];
    t.classList.toggle('active', pages[i] === name);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
}

function toast(msg, type='info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 2500);
}

function setStatus(loggedIn, text) {
  const bar = document.getElementById('statusBar');
  bar.innerHTML = '<span class="dot ' + (loggedIn?'on':'off') + '"></span>' + text;
}

function setResult(text) {
  document.getElementById('result-box').textContent = typeof text === 'object' ? JSON.stringify(text, null, 2) : text;
}

async function api(method, path, body) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  return await r.json();
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ====== 登录 ======
async function doLogin() {
  const appleId = document.getElementById('appleId').value.trim();
  const password = document.getElementById('password').value;
  const code = document.getElementById('code').value.trim();
  if (!appleId || !password) return toast('请填写 Apple ID 和密码', 'error');

  toast('登录中...');
  const body = { appleId, password };
  if (code) body.code = code;

  try {
    const res = await api('POST', '/auth/login', body);
    setResult(res);
    if (res.success) {
      const acct = res.data?.accountInfo?.appleId || appleId;
      setStatus(true, '已登录: ' + acct);
      toast('登录成功 ✅', 'success');
      document.getElementById('password').value = '';
      document.getElementById('code').value = '';
      document.getElementById('codeField').style.display = 'none';
    } else {
      const msg = res.message || res.error || JSON.stringify(res);
      if (msg.includes('验证') || msg.includes('code') || msg.includes('2FA') || msg.includes('Code')) {
        document.getElementById('codeField').style.display = 'block';
        document.getElementById('code').focus();
        toast('请输入双重验证码', 'info');
      } else {
        toast('登录失败: ' + msg, 'error');
      }
    }
  } catch(e) { toast('请求失败: ' + e.message, 'error'); }
}

async function doRefresh() {
  toast('刷新 Token...');
  try {
    const res = await api('POST', '/auth/refresh');
    setResult(res);
    if (res.success) {
      setStatus(true, '已登录');
      toast('Token 已刷新 ✅', 'success');
    } else {
      toast('刷新失败: ' + (res.message || res.error || ''), 'error');
    }
  } catch(e) { toast('请求失败', 'error'); }
}

async function doReset() {
  toast('重置中...');
  try {
    const res = await api('POST', '/auth/reset');
    setResult(res);
    setStatus(false, '未登录');
    toast(res.success ? '已重置 ✅' : '重置失败', res.success ? 'success' : 'error');
  } catch(e) { toast('请求失败', 'error'); }
}

// ====== 搜索 ======
async function doSearch() {
  const term = document.getElementById('searchTerm').value.trim();
  const country = document.getElementById('country').value;
  if (!term) return toast('请输入搜索关键词', 'error');

  const box = document.getElementById('searchResults');
  box.innerHTML = '<div class="loading">搜索中</div>';

  try {
    const res = await api('GET', '/apps/search/' + encodeURIComponent(term) + '?limit=10&country=' + country);
    setResult(res);

    if (res.success && res.data?.results?.length) {
      const apps = res.data.results;
      box.innerHTML = apps.map(app => {
        const name = escapeHtml(app.trackName || app.name || '?');
        const id = app.trackId || app.appId || '?';
        const ver = app.version || '';
        const artist = escapeHtml(app.artistName || '');
        const size = app.fileSizeBytes ? (app.fileSizeBytes/1024/1024).toFixed(1)+'MB' : '';
        return '<div class="app-item" data-id="' + id + '" data-name="' + name + '" onclick="selectApp(this)">' +
          '<div class="name">' + name + '</div>' +
          '<div class="meta">' + artist + (ver ? ' · v'+ver : '') + (size ? ' · '+size : '') + '</div>' +
          '<span class="id-tag">ID: ' + id + '</span>' +
        '</div>';
      }).join('');
      toast('找到 ' + apps.length + ' 个应用', 'success');
    } else {
      box.innerHTML = '<div class="card" style="text-align:center;color:var(--text2)">未找到相关应用</div>';
      toast('无搜索结果', 'error');
    }
  } catch(e) {
    box.innerHTML = '';
    toast('搜索失败: ' + e.message, 'error');
  }
}

function selectApp(el) {
  const id = el.getAttribute('data-id');
  const name = el.getAttribute('data-name');
  document.getElementById('appId').value = id;
  switchTab('versions');
  toast('已选择: ' + name, 'info');
}

// ====== 版本 ======
async function doVersions() {
  const appId = document.getElementById('appId').value.trim();
  if (!appId) return toast('请填写应用 ID', 'error');

  const box = document.getElementById('versionResults');
  box.innerHTML = '<div class="loading">加载版本列表</div>';

  try {
    const res = await api('GET', '/apps/' + appId + '/versions');
    setResult(res);

    if (res.success && res.data) {
      const list = res.data.versionList || res.data.versions || res.data;
      if (Array.isArray(list) && list.length) {
        box.innerHTML = list.slice(0, 50).map(v => {
          const ver = escapeHtml(v.displayVersion || v.version || v.bundle_version || '?');
          const vid = v.appVerId || v.external_identifier || v.versionId || '?';
          const date = v.releaseDate || v.created || '';
          const size = v.size ? (v.size/1024/1024).toFixed(1)+'MB' : '';
          return '<div class="ver-item">' +
            '<div class="ver-info">' +
              '<div class="ver-name">v' + ver + '</div>' +
              '<div class="ver-meta">ID: ' + vid + (date ? ' · ' + date : '') + (size ? ' · ' + size : '') + '</div>' +
            '</div>' +
            '<button class="btn btn-green" data-appid="' + appId + '" data-verid="' + vid + '" onclick="doDownload(this)">下载</button>' +
          '</div>';
        }).join('');
        toast('加载了 ' + Math.min(list.length, 50) + ' 个版本', 'success');
      } else {
        box.innerHTML = '<div class="card" style="text-align:center;color:var(--text2)">暂无版本数据</div>';
      }
    } else {
      box.innerHTML = '<div class="card" style="text-align:center;color:var(--red)">' + escapeHtml(res.message || res.error || '查询失败') + '</div>';
      toast('查询失败', 'error');
    }
  } catch(e) {
    box.innerHTML = '';
    toast('加载失败: ' + e.message, 'error');
  }
}

async function doDownload(el) {
  let appId, verId;
  if (el instanceof HTMLElement) {
    appId = el.getAttribute('data-appid');
    verId = el.getAttribute('data-verid');
  } else {
    appId = document.getElementById('appId').value.trim();
  }
  if (!appId) return toast('请填写应用 ID', 'error');

  toast('获取下载信息...');
  try {
    let path = '/apps/' + appId;
    if (verId) path += '?appVerId=' + verId;
    const res = await api('GET', path);
    setResult(res);

    if (res.success && res.data) {
      const d = res.data;
      const name = d.name || '未知';
      const ver = d.displayVersion || d.version || '?';
      const bundleId = d.bundleId || '';
      const url = d.url || d.downloadUrl || '';

      if (url) {
        const installParams = 'name=' + encodeURIComponent(name) +
          '&displayVersion=' + encodeURIComponent(ver) +
          '&bundleId=' + encodeURIComponent(bundleId) +
          '&fileName=' + encodeURIComponent(url.split('/').pop() || '');
        const installUrl = 'itms-services://?action=download-manifest&url=' +
          encodeURIComponent('https://xiaobai.app?' + installParams);

        toast(name + ' v' + ver + ' 准备安装...', 'success');
        setTimeout(() => { window.location.href = installUrl; }, 500);
      } else {
        toast('未获取到下载链接', 'error');
      }
    } else {
      toast('获取失败: ' + (res.message || res.error || ''), 'error');
    }
  } catch(e) { toast('下载失败: ' + e.message, 'error'); }
}

async function doPurchase() {
  const appId = document.getElementById('appId').value.trim();
  if (!appId) return toast('请填写应用 ID', 'error');

  toast('购买中...');
  try {
    const res = await api('POST', '/apps/' + appId + '/purchase');
    setResult(res);
    toast(res.success ? '购买成功 ✅' : '购买失败: ' + (res.message || res.error || ''), res.success ? 'success' : 'error');
  } catch(e) { toast('购买失败: ' + e.message, 'error'); }
}

// 页面加载时检查登录状态
(async () => {
  try {
    const res = await api('POST', '/auth/refresh');
    if (res.success) setStatus(true, '已登录');
  } catch(e) {}
})();
</script>

</body>
</html>`;

  $done({
    response: {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
      body: HTML
    }
  });
}
