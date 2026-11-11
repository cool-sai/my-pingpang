# 乒乓球约战（my-pingpang）

微信小程序 + 云开发。目标是代替并超越开球网，先把「约一场球、报上名、打完记分」做顺。产品路线和验收口径以 `计划.md` 为准。

## 给改代码的人

- 仓库在本机 `/Users/l/Desktop/projects/my-pingpang`，可以在 `main` 上直接改。
- 须赛梁同意后再 `git commit`；不要自行 push；不要上传云函数（由他本人在开发者工具里上传）。
- 现有报名、开启比赛、记胜负的交互不要改，除非这次任务明确要求。
- 代码审查只有赛梁点名才交质量保证。

## 目录

- `pages/` 小程序页面。约战在 `pages/event/`：详情、名单、对战表（查看分组）、录入成绩、编辑。
- `cloudfunctions/` 云函数。多数是 `index.ts` 和编译出的 `index.js` 双写，改逻辑时两边都要改。
- `cloudfunctions/common/` 数据模型和类型的唯一真源（`models.ts`、`types.ts`）。集合名用已有的 `Collections`，不要另起一套报名结构。
- `components/` 共用组件，`utils/` 共用函数。
- 云环境：`cloud1-6g9iv061f644ffbc`。

## 单场读取

- 列表、`scope: created|signed`、名单头像刷新（`{ id, avatarOpenids }` 返回 base64）继续走 `getEvents`。这条头像分支不要并进 `getEvent`，也不要删。
- 单场详情、名单（第一次拉名单）、对战表、录入成绩、编辑走 `getEvent`。用 `utils/load-event.ts` 的 `fetchEvent` 解包：返回是 `data: event`，不是数组。找不到比赛时用 `missing` 给提示，不要空白页。
- 详情、名单、对战表、录入必须 `withSignups: true`，名单要带 `groupNo` / `groupSeq`；编辑不必带名单。
- `getEvent` 的报名人数上限与 `getEvents` 对齐为 128。改完 `getEvent` 必须先上传，再预览依赖它的页面。
- 不要急着删 `getEvents` 按 id 拉单场的分支，头像刷新还在用。

## 分享

- 只做详情页。`onShareAppMessage` 的 `title` 只用比赛名，`path` 固定为 `/pages/event/detail?id=`。
- 封面用 `wx.createOffscreenCanvas` 在前端拼分享图（比赛名、时间、地点、人数），不要把 `cloud://` 直接塞进 `imageUrl`，也不要在页面上放一块看得见的 canvas。失败时回退到 https 封面或微信默认图。
- 未登录可以打开详情，报名仍走原来的登录校验。

## 界面与加载

- 主色 `#148f4c`，主文字 `#17211b`，次要文字 `#8b97a3`，页面底 `#f2f5f3`，卡片白底。圆角和间距跟现有页面对齐，不要另起一套视觉。
- 需要等云函数或网络数据时，第一屏先画出这一页的真实结构，给容器加上 `is-skeleton`，再用 `<page-loading />` 叠一层半透明遮罩和绿色转圈。遮罩看得到底下的架子，但会挡住点击和滑动。禁止用 `wx:if="{{!isLoading}}"` 把整页藏掉，造成白屏再突然出现。也不要再单独写一套平行的骨架结构。
- `is-skeleton` 的灰条样式写在 `app.wxss`（比赛卡片写在 `event-card` 里）。列表没有数据时，用 `utils/skeleton.wxs` 的 `pad` / `heads` / `rows` 先垫几条同样的节点，有数据了就还走原来的列表，不要另写灰色块。
- 空状态文案（「还没有人报名」等）只在加载结束后再显示，不要在转圈时出现。
- 已经有列表数据时再刷新，不要先清空再转圈，也不要再盖一层遮罩，也不要再加 `is-skeleton`；保持旧数据，新数据到了再替换。
- `wx:if` 和 `wx:for` 不要写在同一个标签上，尤其后面还要跟 `wx:else`：微信会先展开循环，`wx:else` 就对不上。把 `wx:if`/`wx:else` 放在外层 `block` 上，循环写在里面。
- `page-loading` 已在 `app.json` 全局注册，页面里直接用，不必再写 `usingComponents`。它是全屏 `position: fixed` 遮罩，不要再传 `full`。
- 提交、保存、删除等动作继续用按钮的 `loading` 或 `wx.showLoading`，不要和页面首次加载的转圈混用。
- 微信 `button` 默认是整行宽，靠右或跟在标题旁的小按钮要写 `width: auto`。

## 小组战绩

只读，用已有 `results` 在前端算胜/负，不写库、不改积分。逻辑放在 `utils/group-standings.ts`，不要只写在对战表页。先不算净胜，也不做复杂并列打破：按胜场排序，并列保持组内序号。虚拟球友算在组内战绩里。对战表在上，战绩在下。
