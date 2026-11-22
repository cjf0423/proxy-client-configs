/**
 * g1-acq.js — Google One 订阅页商品 ID 映射(Shadowrocket http-response 脚本)
 *
 * 设计原则:
 *   1. 单一职责——只做「原始月付 ID → 优惠档 ID」的字符串映射,不做诊断、不做上报;
 *   2. 目录感知——先从响应原文里收集真实存在的优惠档(acq 结尾),目标档
 *      不在目录而备用档在目录时,自动落到备用档,避免把收银台指向空商品;
 *   3. 数据外置——所有映射集中在 SKU_MAP / FALLBACK 两个表里,增删档位只改表。
 *
 * 版本:v6
 */
"use strict";

console.log("[g1-acq] v6 loaded");

/* 原始 iOS 内购 ID → 目标优惠档 */
var SKU_MAP = {
  "g1.ios.20tb.m.v2":     "g1.20tb.3months_ip_90p.acq",
  "g1.ios.30tb.ai.pro.m": "g1.ai.ultra.3months_ip_90p.acq"
};

/* 目标档不在目录时的备用档(社区实测 75p 档在 Play/iOS 目录均有出现) */
var FALLBACK = {
  "g1.20tb.3months_ip_90p.acq":     "g1.20tb.3months_ip_75p.acq",
  "g1.ai.ultra.3months_ip_90p.acq": "g1.ai.ultra.3months_ip_75p.acq"
};

function occurrences(s, needle) {
  return needle ? s.split(needle).length - 1 : 0;
}

function run() {
  var body = $response && $response.body;
  if (typeof body !== "string" || body === "") {
    $done({});
    return;
  }

  /* 响应里真实存在的优惠档目录 */
  var raw = body.match(/g1\.[a-z0-9._]{2,60}acq/g) || [];
  var seen = {};
  var catalog = [];
  for (var r = 0; r < raw.length; r++) {
    if (!seen[raw[r]]) { seen[raw[r]] = 1; catalog.push(raw[r]); }
  }
  console.log("[g1-acq] 目录优惠档: " + (catalog.join(", ") || "无"));

  var out = body, total = 0;
  var froms = Object.keys(SKU_MAP);
  for (var k = 0; k < froms.length; k++) {
    var from = froms[k];
    var n = occurrences(out, from);
    if (n === 0) continue;

    var to = SKU_MAP[from];
    if (catalog.indexOf(to) === -1 && FALLBACK[to] && catalog.indexOf(FALLBACK[to]) !== -1) {
      console.log("[g1-acq] 主档不在目录,降级 " + to + " -> " + FALLBACK[to]);
      to = FALLBACK[to];
    }

    out = out.split(from).join(to);
    total += n;
    console.log("[g1-acq] " + from + " -> " + to + " x" + n);
  }

  console.log(total ? "[g1-acq] 共改写 " + total + " 处" : "[g1-acq] 未命中");
  $done(total ? { body: out } : {});
}

run();
