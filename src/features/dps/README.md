# MWITools DPS 模块

本目录是 MWITools 内置 DPS/HPS/承伤统计的唯一源码入口。初始实现迁移自
`galaxy-cow-dps` 1.0.50（提交 `fa4d36b`），原作者 ZhuLiMoon / Stella，
按 MIT License 使用；后续版本直接在 MWITools 中维护。

模块通过 ES module 显式导入依赖，由 `index.js` 接入 MWITools 的功能生命周期
和通配游戏消息流，不会自行安装第二个 WebSocket/MessageEvent 钩子。

| 文件                     | 职责                         |
| ------------------------ | ---------------------------- |
| `00-bootstrap.js`        | 启动、资源、设置与公共工具   |
| `10-combat-sources.js`   | 职业识别、调试探针与伤害来源 |
| `20-session.js`          | 战斗会话、诊断与原始捕获     |
| `30-history.js`          | 历史存储、片段选择与视图模型 |
| `40-socket-parser.js`    | 战斗消息解析与归属           |
| `50-graph-components.js` | 趋势图、明细浮层与排行组件   |
| `60-main-panel.js`       | 主面板、工具栏与窗口交互     |
| `70-recount-compat.js`   | 兼容排行面板                 |
| `90-application.js`      | 应用装配、事件连接与公共接口 |

详细设置与历史继续使用 `kikimeter:*` 本地存储键，保证独立脚本用户可无缝迁移。
