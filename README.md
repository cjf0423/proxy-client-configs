# 📱 iOS/macOS 代理客户端配置合集

个人整理的 Surge、Loon、Quantumult X 代理客户端配置文件、模块、脚本和分流规则。

> ⚠️ 本仓库部分内容整理于 2020-2021 年（如京东脚本），已归档至 `archive/` 目录。核心配置文件和分流规则仍可参考使用。

## 📁 目录结构

```
├── surge/                          # Surge (iOS/macOS)
│   ├── Surge.conf                  # 主配置文件（含分流规则、脚本）
│   ├── modules/                    # Surge 模块 (.sgmodule)
│   │   ├── Advertising.sgmodule    # 去广告
│   │   ├── General.sgmodule        # 通用设置
│   │   ├── Fake_Vip.sgmodule       # VIP 破解
│   │   ├── JS_GetCookie.sgmodule   # Cookie 获取
│   │   ├── TikTokJP.sgmodule      # TikTok 日本解锁
│   │   ├── YouTubeAD.sgmodule     # YouTube 去广告
│   │   ├── pojie.sgmodule          # 应用破解合集
│   │   └── ...
│   ├── rules/                      # 自定义分流规则
│   │   ├── Talkatone.list          # Talkatone
│   │   ├── Hsbc.list               # HSBC 汇丰
│   │   └── ifast.list              # iFAST
│   ├── scripts/                    # 脚本
│   │   └── shuqi/                  # 书旗小说签到脚本
│   └── shadowrocket/               # Shadowrocket 配置
│       └── Shadowrocket.conf
│
├── loon/                           # Loon (iOS)
│   ├── loon_config.conf            # 主配置文件
│   ├── Cookies.conf                # Cookie 获取配置
│   ├── Script.conf                 # 脚本配置
│   ├── plugins/                    # Loon 插件
│   │   └── TikTokJP.plugin        # TikTok 日本解锁
│   ├── scripts/                    # 自用脚本
│   │   ├── lb_elm.js               # 饿了么红包
│   │   └── lb_meituan.js           # 美团红包
│   └── clash/                      # Clash/Stash 配置
│       ├── clash.yaml              # Clash 配置
│       ├── GLaDOS_Pro.yaml         # GLaDOS 订阅转 Clash
│       └── Stash/overwrite/        # Stash 覆写
│
├── quantumultx/                    # Quantumult X (iOS)
│   ├── SabrinaQuanxConf.conf       # 主配置文件
│   ├── rewrites/                   # 重写规则
│   │   ├── Advertising.snippet     # 去广告
│   │   └── General.snippet         # 通用
│   ├── rules-split/                # 分流规则（按服务分类）
│   │   ├── Netflix.list            # Netflix
│   │   ├── YouTube.list            # YouTube
│   │   ├── Telegram.list           # Telegram
│   │   ├── TikTok.list             # TikTok
│   │   ├── Spotify.list            # Spotify
│   │   ├── Microsoft.list          # Microsoft
│   │   ├── AdBlock.list            # 去广告
│   │   ├── Outside.list            # 国外网站
│   │   ├── Mainland.list           # 国内直连
│   │   └── zhCN/                   # 中文版分流规则
│   ├── scripts/                    # 脚本
│   │   ├── Netflixx.js             # Netflix 评分
│   │   ├── YouTubeAD.conf          # YouTube 去广告
│   │   ├── bilibiliVIP/            # B站大会员
│   │   └── ...
│   ├── resource-parser/            # 资源解析器
│   │   └── resource-parser.js
│   └── icons/                      # 策略组图标
│       ├── *.png                   # 自定义图标
│       └── png/                    # 国旗/服务图标
│
└── archive/                        # 📦 归档（已过时）
    ├── jd-scripts/                 # 京东签到脚本（2021年，已失效）
    ├── quantumultx-jd-scripts/     # QX 京东脚本
    ├── quantumultx-scheduled-tasks/# QX 定时任务
    └── surge-jd-task/              # Surge 京东任务
```

## 🔧 客户端对照

| 功能 | Surge | Loon | Quantumult X |
|------|-------|------|-------------|
| 主配置 | `Surge.conf` | `loon_config.conf` | `SabrinaQuanxConf.conf` |
| 去广告 | `modules/Advertising.sgmodule` | - | `rewrites/Advertising.snippet` |
| TikTok 解锁 | `modules/TikTokJP.sgmodule` | `plugins/TikTokJP.plugin` | `rules-split/TikTok.list` |
| YouTube 去广告 | `modules/YouTubeAD.sgmodule` | - | `scripts/YouTubeAD.conf` |
| 分流规则 | `rules/` | - | `rules-split/` |
| Cookie 获取 | `modules/JS_GetCookie.sgmodule` | `Cookies.conf` | `scripts/JS_GetCookie.conf` |

## ⚠️ 注意事项

- `archive/` 中的京东脚本整理于 2020-2021 年，京东已多次改版，**脚本均已失效**，仅作为历史存档
- 分流规则建议配合最新的规则集使用（如 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script)）
- 配置文件中的订阅链接需替换为自己的节点订阅
