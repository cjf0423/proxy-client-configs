/*
    Sur2b BoxJS Edition
    基于 Neurogram 的 Sur2b 修改，改为通过 BoxJS 管理配置

    BoxJS 订阅地址: https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/sur2b-boxjs.json

    Surge:
    [Script]
    Sur2b = type=http-response,pattern=https:\/\/www.youtube.com\/api\/timedtext\?,requires-body=1,max-size=0,binary-body-mode=0,timeout=30,script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/Sur2b-BoxJS.js
    [MITM]
    hostname = www.youtube.com

    QuanX:
    [rewrite_local]
    https:\/\/www\.youtube\.com\/api\/timedtext\? url script-response-body https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/Sur2b-BoxJS.js
    [mitm]
    hostname = www.youtube.com

    Loon:
    [Script]
    http-response https:\/\/www\.youtube\.com\/api\/timedtext\? script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/Sur2b-BoxJS.js, requires-body=true, timeout=30, tag=Sur2b

    原作者: Neurogram (Telegram: Neurogram, GitHub: Neurogram-R)
    修改: 小H (BoxJS 适配)
*/

// ============ BoxJS 变量读取 ============
const $ = new Env("Sur2b");

const conf = {
    // AI 摘要
    videoSummary: $.getdata("sur2b_video_summary") === "true",
    openAIProxyUrl: $.getdata("sur2b_openai_url") || "https://api.openai.com/v1/chat/completions",
    openAIAPIKey: $.getdata("sur2b_openai_key") || "",
    openAIModel: $.getdata("sur2b_openai_model") || "gpt-4o-mini",
    summaryPrompts: $.getdata("sur2b_summary_prompt") || "请用中文简要总结以下 YouTube 视频字幕内容，分条列出要点：\n\n{{subtitles}}",
    summaryMaxMinutes: parseInt($.getdata("sur2b_summary_max_min") || "30"),
    // 字幕翻译
    videoTranslation: $.getdata("sur2b_video_translation") !== "false",
    translationProvider: $.getdata("sur2b_translation_provider") || "Google",
    targetLanguage: $.getdata("sur2b_target_lang") || "zh-CN",
    subLine: parseInt($.getdata("sur2b_sub_line") || "1"),
    // DeepL
    deepLAPIKey: $.getdata("sur2b_deepl_key") || "",
    deepLUrl: $.getdata("sur2b_deepl_url") || "https://api-free.deepl.com/v2/translate",
    // 缓存
    cacheMaxHours: parseInt($.getdata("sur2b_cache_hours") || "24"),
};

// ============ 主逻辑 ============
const url = $request.url;
let body, subtitleData;
const autoGenSub = url.includes('&kind=asr');
const videoID = url.match(/(\?|&)v=([^&]+)/)?.[2];
const sourceLang = url.match(/&lang=([^&]+)/)?.[1];
let cache = $.getdata('Sur2bCache') || '{}';
cache = JSON.parse(cache);

(async () => {

    if (!conf.openAIAPIKey && conf.videoSummary) {
        $.msg('Sur2b', '', '请在 BoxJS 中配置 OpenAI API Key');
    }

    body = $response.body;
    subtitleData = processTimedText(body);

    if (!subtitleData.processedText) {
        $.done({});
        return;
    }

    let summaryContent, translatedBody;

    if (conf.videoSummary && subtitleData.maxT <= conf.summaryMaxMinutes * 60 * 1000) {
        summaryContent = await summarizer();
    }
    if (conf.videoTranslation) {
        translatedBody = await translator();
    }

    if ((summaryContent || translatedBody) && videoID && sourceLang) {

        if (!cache[videoID]) cache[videoID] = {};
        if (!cache[videoID][sourceLang]) cache[videoID][sourceLang] = {};

        if (summaryContent) {
            cache[videoID][sourceLang].summary = {
                content: summaryContent,
                timestamp: new Date().getTime()
            };
        }

        if (translatedBody) {
            if (!cache[videoID][sourceLang].translation) cache[videoID][sourceLang].translation = {};
            cache[videoID][sourceLang].translation[conf.targetLanguage] = {
                content: translatedBody,
                timestamp: new Date().getTime()
            };
        }
    }

    cleanCache();
    $.setdata(JSON.stringify(cache), 'Sur2bCache');

    $.done({ body });

})();

// ============ 生成摘要页面 (Telegraph) ============
async function createSummaryPage(content, videoID) {
    // 自动创建 Telegraph 账号（首次）
    let token = $.getdata('sur2b_telegraph_token');
    if (!token) {
        const acc = await sendRequest({
            url: 'https://api.telegra.ph/createAccount?short_name=Sur2b&author_name=YouTube%E6%91%98%E8%A6%81'
        });
        if (!acc.ok) throw new Error('Telegraph 账号创建失败');
        token = acc.result.access_token;
        $.setdata(token, 'sur2b_telegraph_token');
    }

    // 构建内容节点
    const nodes = [];
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.trim()) {
            nodes.push({ tag: 'p', children: [line] });
        }
    }
    if (videoID) {
        nodes.push({ tag: 'p', children: [{ tag: 'a', attrs: { href: `https://www.youtube.com/watch?v=${videoID}` }, children: ['🔗 返回 YouTube 观看'] }] });
    }

    // 创建页面
    const page = await sendRequest({
        url: 'https://api.telegra.ph/createPage',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            access_token: token,
            title: 'YouTube 视频摘要',
            content: nodes,
            return_content: false
        })
    }, 'post');

    if (!page.ok) throw new Error('Telegraph 页面创建失败');
    return page.result.url;
}

// ============ AI 摘要 ============
async function summarizer() {

    if (cache[videoID]?.[sourceLang]?.summary) {
        const cachedContent = cache[videoID][sourceLang].summary.content;
        try {
            const pageUrl = await createSummaryPage(cachedContent, videoID);
            $.msg('YouTube 视频摘要', '点击查看完整摘要 👆', cachedContent.substring(0, 80) + '...', { url: pageUrl });
        } catch (e) {
            $.msg('YouTube 视频摘要', '', cachedContent);
        }
        return;
    }

    const options = {
        url: conf.openAIProxyUrl,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + conf.openAIAPIKey
        },
        body: JSON.stringify({
            model: conf.openAIModel,
            messages: [
                {
                    role: 'user',
                    content: conf.summaryPrompts.replace(/{{subtitles}}/, subtitleData.processedText)
                }
            ]
        })
    };

    try {
        if (!conf.openAIProxyUrl) throw new Error('未配置 AI 接口地址');
        if (!conf.openAIAPIKey) throw new Error('未配置 API Key');
        if (!conf.openAIModel) throw new Error('未配置模型');

        const resp = await sendRequest(options, 'post');
        if (resp.error) throw new Error(resp.error.message);
        const content = resp.choices[0].message.content;
        try {
            const pageUrl = await createSummaryPage(content, videoID);
            $.msg('YouTube 视频摘要', '点击查看完整摘要 👆', content.substring(0, 80) + '...', { url: pageUrl });
        } catch (e) {
            $.msg('YouTube 视频摘要', '', content);
        }
        return content;
    } catch (err) {
        $.msg('YouTube 视频摘要', '摘要请求失败', String(err));
        return;
    }
}

// ============ 字幕翻译 ============
async function translator() {

    if (cache[videoID]?.[sourceLang]?.translation?.[conf.targetLanguage]) {
        body = cache[videoID][sourceLang].translation[conf.targetLanguage].content;
        return;
    }

    let patt = new RegExp(`&lang=${conf.targetLanguage}&`, 'i');

    if (conf.targetLanguage == 'zh-CN' || conf.targetLanguage == 'ZH-HANS') patt = /&lang=zh(-Hans)*&/i;
    if (conf.targetLanguage == 'zh-TW' || conf.targetLanguage == 'ZH-HANT') patt = /&lang=zh-Hant&/i;

    if (url.includes('&tlang=') || patt.test(url)) return;

    if (/&lang=zh(-Han)*/i.test(url) && /^zh-(CN|TW|HAN)/i.test(conf.targetLanguage)) return await chineseTransform();

    if (autoGenSub) return;

    const originalSubs = [];
    const regex = /<p t="\d+" d="\d+">([^<]+)<\/p>/g;
    let match;

    while ((match = regex.exec(body)) !== null) {
        originalSubs.push(match[1]);
    }

    if (originalSubs.length === 0) return;

    const targetSubs = [];
    const batchSize = 50;

    for (let i = 0; i < originalSubs.length; i += batchSize) {
        const batch = originalSubs.slice(i, i + batchSize);
        try {
            const translatedBatch = await translateSwitcher(batch);
            targetSubs.push(...translatedBatch);
        } catch (error) {
            $.msg('YouTube 视频翻译', '翻译请求失败', String(error));
            return;
        }
    }

    let subIndex = 0;
    const translatedBody = body.replace(regex, (fullMatch) => {
        if (subIndex < targetSubs.length && subIndex < originalSubs.length) {
            const originalText = originalSubs[subIndex];
            const translatedText = targetSubs[subIndex];

            let finalSubText;
            switch (conf.subLine) {
                case 1:
                    finalSubText = `${translatedText}\n${originalText}`;
                    break;
                case 2:
                    finalSubText = `${originalText}\n${translatedText}`;
                    break;
                case 0:
                default:
                    finalSubText = translatedText;
                    break;
            }

            subIndex++;
            const attributesMatch = fullMatch.match(/<p (t="\d+" d="\d+")>/);
            return `<p ${attributesMatch[1]}>${finalSubText}</p>`;
        }
        return fullMatch;
    });

    body = translatedBody;
    return translatedBody;
}

async function translateSwitcher(subs) {
    switch (conf.translationProvider) {
        case 'Google':
            return await googleTranslator(subs);
        case 'DeepL':
            return await deepLTranslator(subs);
        default:
            throw new Error(`未知的翻译服务: ${conf.translationProvider}`);
    }
}

async function googleTranslator(subs) {
    const options = {
        url: `https://translate.google.com/translate_a/single?client=it&dt=qca&dt=t&dt=rmt&dt=bd&dt=rms&dt=sos&dt=md&dt=gt&dt=ld&dt=ss&dt=ex&otf=2&dj=1&hl=en&ie=UTF-8&oe=UTF-8&sl=auto&tl=${conf.targetLanguage}`,
        headers: {
            'User-Agent': 'GoogleTranslate/6.29.59279 (iPhone; iOS 15.4; en; iPhone14,2)'
        },
        body: `q=${encodeURIComponent('<p>' + subs.join('\n<p>'))}`
    };

    const resp = await sendRequest(options, 'post');
    if (!resp.sentences) throw new Error(`Google 翻译失败: ${JSON.stringify(resp)}`);

    const combinedTrans = resp.sentences.map(s => s.trans).join('');
    const splitSentences = combinedTrans.split('<p>');
    const targetSubs = splitSentences
        .filter(sentence => sentence && sentence.trim().length > 0)
        .map(sentence => sentence.replace(/\s*[\r\n]+\s*/g, ' ').trim());

    return targetSubs;
}

async function deepLTranslator(subs) {
    if (!conf.deepLAPIKey) throw new Error('未配置 DeepL API Key');

    const options = {
        url: conf.deepLUrl,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'DeepL-Auth-Key ' + conf.deepLAPIKey,
        },
        body: JSON.stringify({
            text: subs,
            target_lang: conf.targetLanguage
        })
    };

    const resp = await sendRequest(options, 'post');
    if (!resp.translations) throw new Error(`DeepL 翻译失败: ${JSON.stringify(resp)}`);

    return resp.translations.map(translation => translation.text);
}

async function chineseTransform() {
    let from = 'cn';
    let to = 'tw';
    if (/^zh-(CN|HANS)/i.test(conf.targetLanguage)) [from, to] = [to, from];

    const openccJS = await sendRequest({
        url: 'https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js'
    });
    eval(openccJS);
    const converter = OpenCC.Converter({ from: from, to: to });
    body = converter(body);
}

// ============ 工具函数 ============
function processTimedText(xml) {
    const regex = /<p t="(\d+)"[^>]*>(.*?)<\/p>/gs;
    let match;
    let maxT = 0;
    const results = [];

    while ((match = regex.exec(xml)) !== null) {
        const t = parseInt(match[1], 10);
        const content = match[2].trim();
        let lineText = '';

        if (content.startsWith('<s')) {
            const sTagRegex = /<s[^>]*>([^<]+)<\/s>/g;
            const words = Array.from(content.matchAll(sTagRegex), m => m[1]);
            if (words.length > 0) lineText = words.join('');
        } else {
            lineText = content;
        }

        lineText = decodeHTMLEntities(lineText).trim();

        if (lineText) {
            if (t > maxT) maxT = t;

            const totalSeconds = Math.floor(t / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const paddedSeconds = String(seconds).padStart(2, '0');
            let formattedTime;

            if (hours > 0) {
                const paddedMinutes = String(minutes).padStart(2, '0');
                formattedTime = `(${hours}:${paddedMinutes}:${paddedSeconds})`;
            } else {
                formattedTime = `(${minutes}:${paddedSeconds})`;
            }

            results.push(`${formattedTime} ${lineText}`);
        }
    }

    return {
        processedText: results.join('\n'),
        maxT: maxT
    };
}

function decodeHTMLEntities(text) {
    const entities = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>',
        '&quot;': '"', '&#39;': "'"
    };
    return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, match => entities[match]);
}

function sendRequest(options, method = 'get') {
    return new Promise((resolve, reject) => {
        const httpMethod = typeof $httpClient !== 'undefined' ? $httpClient : $.http;
        httpMethod[method](options, (error, response, data) => {
            if (error) return reject(error);
            try {
                resolve(JSON.parse(data));
            } catch {
                resolve(data);
            }
        });
    });
}

function cleanCache() {
    const now = Date.now();
    const maxMs = conf.cacheMaxHours * 60 * 60 * 1000;

    for (const itemKey of Object.keys(cache)) {
        const item = cache[itemKey];
        for (const lang of Object.keys(item)) {
            const langObj = item[lang];

            if (langObj.summary && now - langObj.summary.timestamp > maxMs) {
                delete langObj.summary;
            }

            if (langObj.translation) {
                for (const tLang of Object.keys(langObj.translation)) {
                    if (now - langObj.translation[tLang].timestamp > maxMs) {
                        delete langObj.translation[tLang];
                    }
                }
                if (Object.keys(langObj.translation).length === 0) {
                    delete langObj.translation;
                }
            }

            if (!langObj.summary && !langObj.translation) delete item[lang];
        }
        if (Object.keys(item).length === 0) delete cache[itemKey];
    }
    return cache;
}

// ============ Env 兼容层 (Surge/QuanX/Loon) ============
function Env(name) {
    this.name = name;
    this.isSurge = typeof $httpClient !== 'undefined' && typeof $persistentStore !== 'undefined';
    this.isQuanX = typeof $task !== 'undefined';
    this.isLoon = typeof $loon !== 'undefined';

    this.getdata = (key) => {
        if (this.isSurge || this.isLoon) return $persistentStore.read(key);
        if (this.isQuanX) return $prefs.valueForKey(key);
    };

    this.setdata = (val, key) => {
        if (this.isSurge || this.isLoon) return $persistentStore.write(val, key);
        if (this.isQuanX) return $prefs.setValueForKey(val, key);
    };

    this.msg = (title, subtitle, body, opts = {}) => {
        if (this.isSurge || this.isLoon) $notification.post(title, subtitle, body, opts);
        if (this.isQuanX) $notify(title, subtitle, body, opts);
    };

    this.done = (val = {}) => {
        $done(val);
    };

    this.http = {
        get: (options, callback) => {
            if (this.isSurge || this.isLoon) $httpClient.get(options, callback);
            else if (this.isQuanX) {
                if (typeof options === 'string') options = { url: options };
                options.method = 'GET';
                $task.fetch(options).then(
                    resp => callback(null, resp, resp.body),
                    err => callback(err)
                );
            }
        },
        post: (options, callback) => {
            if (this.isSurge || this.isLoon) $httpClient.post(options, callback);
            else if (this.isQuanX) {
                if (typeof options === 'string') options = { url: options };
                options.method = 'POST';
                $task.fetch(options).then(
                    resp => callback(null, resp, resp.body),
                    err => callback(err)
                );
            }
        }
    };
}
