/*
GLaDOS 签到 + 自动兑换会员天数 脚本
适用平台: Surge, Quantumult X, 青龙面板 (Node.js)

功能:
1. 每日自动签到
2. 查询积分和剩余天数
3. 积分达标自动兑换会员天数 (默认 500分→100天)
4. 青龙面板自带通知推送

环境变量:
- GLADOS_COOKIE: 必填, Cookie (多账号用 & 分隔)
- EXCHANGE_PLAN: 可选, 兑换计划 plan100(100分→10天) / plan200(200分→30天) / plan500(500分→100天, 默认) / off(关闭)

使用方法:
1. 在 Surge/QuanX 中配置好抓包脚本规则和 MitM (主机名: glados.one, glados.cloud)。
2. 使用 Safari 或代理 App 内置浏览器访问 https://glados.cloud/console 并登录。
3. 如果通知"获取 Cookie 成功"，说明抓包完成，随后请禁用抓包规则。
4. 开启定时任务即可。
*/

const $ = new Env("GLaDOS签到");
const cookieKey = "glados_cookie";
const isRequest = typeof $request !== "undefined";

// 兑换计划
const EXCHANGE_PLANS = {
  plan100: { points: 100, days: 10 },
  plan200: { points: 200, days: 30 },
  plan500: { points: 500, days: 100 },
};

// 域名列表 (优先 glados.cloud)
const DOMAINS = [
  "https://glados.cloud",
  "https://glados.one",
  "https://glados.rocks",
  "https://glados.network",
];

if (isRequest) {
  getCookie();
} else {
  main();
}

function getCookie() {
  const headers = $request.headers;
  const cookie = headers["Cookie"] || headers["cookie"];

  if (cookie) {
    const saveResult = $.setdata(cookie, cookieKey);
    if (saveResult) {
      $.msg($.name, "✅ 获取 Cookie 成功", "已保存到本地存储，现在可以禁用获取 Cookie 的脚本规则了。");
    } else {
      $.msg($.name, "❌ 获取 Cookie 失败", "无法写入本地存储。");
    }
  } else {
    $.msg($.name, "❌ 获取 Cookie 失败", "未在请求头中找到 Cookie。");
  }
  $.done({});
}

async function main() {
  // 加载青龙通知模块
  let notify;
  if ($.isNode) {
    try {
      notify = require("./sendNotify");
    } catch (e) {
      try {
        notify = require("/ql/data/scripts/sendNotify");
      } catch (e2) {
        console.log("⚠️ 未找到 sendNotify 模块，将仅输出日志不推送通知");
      }
    }
  }

  // 获取 Cookie
  const cookies = getCookies();
  if (!cookies || cookies.length === 0) {
    const errMsg = "❌ 未找到 Cookie，请先配置环境变量 GLADOS_COOKIE";
    console.log(errMsg);
    $.msg($.name, "❌ 签到失败", errMsg);
    return $.done();
  }

  // 获取兑换计划
  const exchangePlan = getExchangePlan();

  let successCnt = 0;
  let totalMsg = "";

  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i];
    const accountIdx = i + 1;
    console.log(`\n========== 账号 ${accountIdx} ==========`);

    let result = {
      email: "?",
      leftDays: "?",
      points: "?",
      pointsChange: "?",
      checkinMsg: "",
      exchangeMsg: "",
      exchangeInfo: "",
    };

    // 1. 签到
    let checkinRes = await httpRequest("POST", "/api/user/checkin", { token: "glados.cloud" }, cookie);
    if (checkinRes) {
      result.checkinMsg = checkinRes.message || "未知";
      const msg = (checkinRes.message || "").toLowerCase();
      if (
        msg.includes("checkin! got") ||
        msg.includes("checkin repeats") ||
        msg.includes("today's observation logged") ||
        checkinRes.code === 0
      ) {
        successCnt++;
        console.log(`✅ 签到成功: ${checkinRes.message}`);
      } else {
        console.log(`⚠️ 签到结果: ${checkinRes.message}`);
      }
    } else {
      result.checkinMsg = "网络错误";
      console.log("❌ 签到请求失败");
    }

    // 2. 获取状态
    let statusRes = await httpRequest("GET", "/api/user/status", null, cookie);
    if (statusRes && statusRes.data) {
      result.email = statusRes.data.email || "?";
      result.leftDays = parseInt(statusRes.data.leftDays) || "?";
    }

    // 3. 获取积分
    let pointsRes = await httpRequest("GET", "/api/user/points", null, cookie);
    if (pointsRes && pointsRes.points !== undefined) {
      result.points = parseInt(pointsRes.points) || 0;
      // 最近一次积分变化
      const history = pointsRes.history || [];
      if (history.length > 0) {
        const change = parseInt(history[0].change) || 0;
        result.pointsChange = change >= 0 ? `+${change}` : `${change}`;
      }
      // 兑换选项展示
      const plans = pointsRes.plans || {};
      let lines = [];
      for (const [key, plan] of Object.entries(EXCHANGE_PLANS)) {
        const need = plan.points;
        const days = plan.days;
        if (result.points >= need) {
          lines.push(`  ✅ ${need}分→${days}天 (可兑换)`);
        } else {
          lines.push(`  ❌ ${need}分→${days}天 (差${need - result.points}分)`);
        }
      }
      result.exchangeInfo = lines.join("\n");
    }

    // 4. 自动兑换
    if (exchangePlan && exchangePlan !== "off") {
      const planInfo = EXCHANGE_PLANS[exchangePlan];
      if (planInfo) {
        if (typeof result.points === "number" && result.points >= planInfo.points) {
          console.log(`🎁 积分 ${result.points} 满足 ${planInfo.points}，尝试兑换 ${planInfo.days} 天...`);
          let exchangeRes = await httpExchange("/api/user/exchange", { planType: exchangePlan }, cookie);
          if (exchangeRes && exchangeRes.code === 0) {
            result.exchangeMsg = `🎁 兑换成功! +${planInfo.days}天 (消耗${planInfo.points}分)`;
            console.log(result.exchangeMsg);
            // 刷新状态
            statusRes = await httpRequest("GET", "/api/user/status", null, cookie);
            if (statusRes && statusRes.data) {
              result.leftDays = parseInt(statusRes.data.leftDays) || result.leftDays;
            }
            pointsRes = await httpRequest("GET", "/api/user/points", null, cookie);
            if (pointsRes && pointsRes.points !== undefined) {
              result.points = parseInt(pointsRes.points) || 0;
            }
          } else {
            const errMsg = exchangeRes ? (exchangeRes.message || "失败") : "网络错误";
            result.exchangeMsg = `⚠️ 兑换失败: ${errMsg}`;
            console.log(result.exchangeMsg);
          }
        } else {
          const pts = typeof result.points === "number" ? result.points : 0;
          result.exchangeMsg = `⏭️ 积分不足(${pts}/${planInfo.points})，攒够自动兑换${planInfo.days}天`;
          console.log(result.exchangeMsg);
        }
      }
    }

    // 汇总信息
    let accountMsg = `👤 账号${accountIdx}: ${result.email}\n`;
    accountMsg += `📊 当前积分: ${result.points} (${result.pointsChange})\n`;
    accountMsg += `📅 剩余天数: ${result.leftDays} 天\n`;
    accountMsg += `📝 签到结果: ${result.checkinMsg}\n`;
    if (result.exchangeMsg) {
      accountMsg += `💰 自动兑换: ${result.exchangeMsg}\n`;
    }
    if (result.exchangeInfo) {
      accountMsg += `🎁 兑换选项:\n${result.exchangeInfo}\n`;
    }
    console.log(accountMsg);
    totalMsg += accountMsg + "\n";
  }

  // 发送通知
  const title = `GLaDOS签到: 成功${successCnt}/${cookies.length}`;
  const notifyContent = totalMsg.trim();

  // 青龙面板通知
  if (notify && notify.sendNotify) {
    await notify.sendNotify(title, notifyContent);
    console.log("✅ 通知已推送");
  }
  // Surge/QuanX 通知
  $.msg($.name, title, notifyContent);

  $.done();
}

// ================ Cookie 处理 ================

function getCookies() {
  if ($.isNode) {
    const raw = process.env.GLADOS_COOKIE || "";
    if (!raw) return [];
    const sep = raw.includes("\n") ? "\n" : "&";
    return raw.split(sep).map((s) => s.trim()).filter(Boolean);
  } else {
    const cookie = $.getdata(cookieKey);
    return cookie ? [cookie] : [];
  }
}

function getExchangePlan() {
  if ($.isNode) {
    const raw = (process.env.EXCHANGE_PLAN || "plan500").trim().toLowerCase();
    const disabled = ["", "off", "no", "none", "false", "0", "disabled"];
    if (disabled.includes(raw)) return "off";
    if (EXCHANGE_PLANS[raw]) return raw;
    console.log(`⚠️ EXCHANGE_PLAN 值 '${raw}' 无效 (可选: plan100/plan200/plan500/off)，使用默认 plan500`);
    return "plan500";
  }
  return "plan500"; // Surge/QuanX 默认
}

// ================ HTTP 请求 ================

async function httpRequest(method, path, data, cookie) {
  const headers = {
    "Content-Type": "application/json;charset=utf-8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Cookie: cookie,
  };

  for (const domain of DOMAINS) {
    try {
      const url = `${domain}${path}`;
      headers["Origin"] = domain;
      headers["Referer"] = `${domain}/console/checkin`;

      let res;
      if ($.isNode) {
        const axios = require("axios");
        if (method === "GET") {
          res = await axios.get(url, { headers, timeout: 10000 });
        } else {
          res = await axios.post(url, data, { headers, timeout: 10000 });
        }
        return res.data;
      } else if ($.isSurge) {
        if (method === "GET") {
          return await new Promise((resolve, reject) => {
            $httpClient.get({ url, headers }, (err, resp, body) =>
              err ? reject(err) : resolve(JSON.parse(body))
            );
          });
        } else {
          return await new Promise((resolve, reject) => {
            $httpClient.post({ url, headers, body: JSON.stringify(data) }, (err, resp, body) =>
              err ? reject(err) : resolve(JSON.parse(body))
            );
          });
        }
      } else if ($.isQuanX) {
        const resp = await $task.fetch({
          url,
          method,
          headers,
          body: data ? JSON.stringify(data) : undefined,
        });
        return JSON.parse(resp.body);
      }
    } catch (e) {
      console.log(`⚠️ ${domain} 请求失败: ${e.message || e}`);
      continue;
    }
  }
  return null;
}

// 兑换接口需要 form 表单提交
async function httpExchange(path, data, cookie) {
  for (const domain of DOMAINS) {
    try {
      const url = `${domain}${path}`;
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Cookie: cookie,
        Origin: domain,
        Referer: `${domain}/console/checkin`,
      };

      if ($.isNode) {
        const axios = require("axios");
        const qs = require("querystring");
        const res = await axios.post(url, qs.stringify(data), {
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 10000,
        });
        return res.data;
      } else if ($.isSurge) {
        return await new Promise((resolve, reject) => {
          const formBody = Object.entries(data)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join("&");
          $httpClient.post(
            {
              url,
              headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
              body: formBody,
            },
            (err, resp, body) => (err ? reject(err) : resolve(JSON.parse(body)))
          );
        });
      } else if ($.isQuanX) {
        const formBody = Object.entries(data)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&");
        const resp = await $task.fetch({
          url,
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody,
        });
        return JSON.parse(resp.body);
      }
    } catch (e) {
      console.log(`⚠️ 兑换 ${domain} 请求失败: ${e.message || e}`);
      continue;
    }
  }
  return null;
}

// ================ 环境适配层 ================

function Env(name) {
  this.name = name;
  this.isNode = typeof module !== "undefined" && !!module.exports;
  this.isQuanX = typeof $task !== "undefined";
  this.isSurge = typeof $httpClient !== "undefined" && !this.isQuanX;

  this.msg = (title, subtitle, body) => {
    if (this.isQuanX) $notify(title, subtitle, body);
    if (this.isSurge) $notification.post(title, subtitle, body);
    if (this.isNode) console.log(`\n=== ${title} ===\n${subtitle}\n${body}`);
  };

  this.setdata = (val, key) => {
    if (this.isSurge) return $persistentStore.write(val, key);
    if (this.isQuanX) return $prefs.setValueForKey(val, key);
    if (this.isNode) return false;
  };

  this.getdata = (key) => {
    if (this.isSurge) return $persistentStore.read(key);
    if (this.isQuanX) return $prefs.valueForKey(key);
    if (this.isNode) return process.env[key];
  };

  this.done = (val = {}) => {
    if (!this.isNode) $done(val);
  };
}
