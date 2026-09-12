/*
    JJ象棋 AI 军师 - 测试版，只弹通知确认拦截是否生效
*/

$notification.post('♟️ 测试', '脚本已触发', '收到请求');

try {
    var bodyText = $request.body || '空';
    $notification.post('♟️ 测试', 'Body', bodyText.substring(0, 100));
} catch(e) {
    $notification.post('♟️ 测试', '错误', String(e));
}

$done({});
