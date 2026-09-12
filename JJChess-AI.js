/*
    JJ象棋 AI 分析助手
    拦截棋局数据，通过大模型分析最佳走法，Surge 通知提示

    BoxJS 订阅: https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/jjchess-boxjs.json

    Surge:
    [Script]
    JJChessAI = type=http-request, pattern=https:\/\/arena\.srv\.jj\.cn\/api\/v2\/chess\/check_state, requires-body=1, max-size=0, timeout=60, script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/JJChess-AI.js
    [MITM]
    hostname = arena.srv.jj.cn

    原作者: 小H
*/

// ============ BoxJS 配置 ============
const enabled = $persistentStore.read("jjchess_enabled") !== "false";
const apiUrl = $persistentStore.read("jjchess_api_url") || "";
const apiKey = $persistentStore.read("jjchess_api_key") || "";
const model = $persistentStore.read("jjchess_model") || "gemini-3.8-flash-high";
const mySide = $persistentStore.read("jjchess_my_side") || "both";

try {
    if (!enabled || !apiUrl || !apiKey) {
        $done({});
    } else {
        main();
    }
} catch (e) {
    $done({});
}

function main() {
    const body = JSON.parse($request.body);
    const order = body.order;

    if (!order || !order.startsWith('position fen ')) {
        $done({});
        return;
    }

    // 去重：相同局面不重复分析
    const lastOrder = $persistentStore.read("jjchess_last_order");
    if (order === lastOrder) {
        $done({});
        return;
    }
    $persistentStore.write(order, "jjchess_last_order");

    // 解析 FEN 和走法
    const afterFen = order.substring(13); // 去掉 "position fen "
    const movesMatch = afterFen.match(/^(.+?)\s+moves\s+(.+)$/);
    let baseFen, movesStr;
    if (movesMatch) {
        baseFen = movesMatch[1];
        movesStr = movesMatch[2];
    } else {
        baseFen = afterFen;
        movesStr = '';
    }

    // 应用走法得到当前局面
    const currentFen = movesStr ? applyMoves(baseFen, movesStr) : baseFen;
    const turn = currentFen.split(' ')[1]; // 'w'=红方 'b'=黑方

    // 只分析用户的回合
    if (mySide === "red" && turn !== "w") { $done({}); return; }
    if (mySide === "black" && turn !== "b") { $done({}); return; }

    // 生成棋盘文字图
    const boardStr = buildBoard(currentFen.split(' ')[0]);
    const turnStr = turn === 'w' ? '红方' : '黑方';

    // 立即放行请求，不阻塞游戏
    $done({});

    // 构建 AI 提示词
    const prompt = `你是中国象棋特级大师。请分析以下棋局，给出当前最佳走法。

【当前棋盘】（上方为黑方，下方为红方）
黑 ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨
${boardStr}红 九 八 七 六 五 四 三 二 一

当前FEN: ${currentFen}
轮到: ${turnStr}走棋

棋子说明: 帅仕相车马炮兵=红方, 将士象車馬砲卒=黑方

【要求】
1. 给出最佳走法，用标准记谱法（如"马二进三"、"炮八平五"）
2. 一句话说明理由
3. 给出对手可能的应对和你的后续1-2步
格式示例:
最佳: 马二进三（跳马出击，威胁中路）
预测: 对方炮8平5，我方车一进一`;

    // 调用 AI
    $httpClient.post({
        url: apiUrl,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }]
        })
    }, function(err, resp, data) {
        try {
            if (!err && data) {
                const result = JSON.parse(data);
                if (result.choices && result.choices[0]) {
                    const content = result.choices[0].message.content;
                    $notification.post('♟️ 象棋军师', turnStr + '走棋', content);
                }
            }
        } catch (e) {
            // 静默
        }
    });
}

// ============ 应用走法到FEN ============
function applyMoves(fen, movesStr) {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    const board = [];

    // FEN → 10x9 棋盘数组
    for (var i = 0; i < rows.length; i++) {
        var row = [];
        for (var j = 0; j < rows[i].length; j++) {
            var ch = rows[i][j];
            if (ch >= '1' && ch <= '9') {
                for (var k = 0; k < parseInt(ch); k++) row.push('.');
            } else {
                row.push(ch);
            }
        }
        board.push(row);
    }

    // 逐步应用走法
    var moves = movesStr.trim().split(/\s+/);
    var turn = parts[1];

    for (var m = 0; m < moves.length; m++) {
        var move = moves[m];
        var fromCol = move.charCodeAt(0) - 97;
        var fromRow = 9 - parseInt(move[1]);
        var toCol = move.charCodeAt(2) - 97;
        var toRow = 9 - parseInt(move[3]);

        board[toRow][toCol] = board[fromRow][fromCol];
        board[fromRow][fromCol] = '.';
        turn = (turn === 'w') ? 'b' : 'w';
    }

    // 数组 → FEN
    var fenRows = [];
    for (var r = 0; r < board.length; r++) {
        var fenRow = '';
        var empty = 0;
        for (var c = 0; c < board[r].length; c++) {
            if (board[r][c] === '.') {
                empty++;
            } else {
                if (empty > 0) { fenRow += empty; empty = 0; }
                fenRow += board[r][c];
            }
        }
        if (empty > 0) fenRow += empty;
        fenRows.push(fenRow);
    }

    return fenRows.join('/') + ' ' + turn + ' - - 0 1';
}

// ============ FEN → 文字棋盘 ============
function buildBoard(piecePlacement) {
    var pieceMap = {
        'K': '帅', 'A': '仕', 'B': '相', 'R': '车', 'N': '马', 'C': '炮', 'P': '兵',
        'k': '将', 'a': '士', 'b': '象', 'r': '車', 'n': '馬', 'c': '砲', 'p': '卒'
    };

    var rows = piecePlacement.split('/');
    var board = '';

    for (var i = 0; i < rows.length; i++) {
        var line = '';
        for (var j = 0; j < rows[i].length; j++) {
            var ch = rows[i][j];
            if (ch >= '1' && ch <= '9') {
                for (var k = 0; k < parseInt(ch); k++) {
                    line += (line ? ' ' : '') + '・';
                }
            } else {
                line += (line ? ' ' : '') + (pieceMap[ch] || ch);
            }
        }
        board += '   ' + line + '\n';
        if (i === 4) {
            board += '   ＝＝＝＝楚河汉界＝＝＝＝\n';
        }
    }

    return board;
}
