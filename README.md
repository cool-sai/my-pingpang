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

## 个人主页

- 路径：`/pages/user/detail?openid=`。看别人和看自己是同一页。未登录也可以看别人的主页；地址里没有 openid 时，已登录看自己，未登录则提示去登录。找不到人或已注销时显示「已注销」。虚拟球友和普通球友一样可以打开主页。
- 入口：参赛名单整行可点；对战表只点左侧姓名和小组战绩里的名字（格子仍只用来记胜负；录入成绩页点名字仍是选获胜者）；排名列表点人；已登录时点「我的排名」；「我的」菜单里的「积分」（不再 switchTab 到排名）。
- 页面自上而下：头像、昵称、当前积分，带场次/胜负/胜率；近 40 局已入账的积分折线图（没有变化时显示「暂无积分变化」，不画平线）；比赛列表每一行是对手、胜负、日期，不再显示头像、比分和积分增减。点日期（有 `eventId` 的约战局）进入该场约战的赛程 `/pages/event/board?id=`；友谊赛没有约战，日期不可跳。点对手进对方主页。「我的战绩」列表仍用 `getMatches` 只查自己的比赛。
- 云函数 `getUserProfile` 入参 `{ openid }`，返回 `{ success, data?: { user, matches, chart, missing? }, error? }`。`user` 含资料、积分、场次和胜率，排名能便宜拿到才带 `rank`（虚拟球友和真人一样，按「积分更高的人数 + 1」计算）。虚拟球友的 `user` 另带 `isOwner` / `isAdmin`，供主页显示「编辑资料」。`matches` 已把视角回正（left 是主页人）。`chart` 只含确实改过积分的局，用当前 `users.score` 减去这 40 局 `scoreChange` 之和往回推。头像现签临时 https，不写回库。
- 约战在 `eventSchedule` 的 `report` / `set` 写入 `events.results` 时，会用稳定 `_id`（`${eventId}_${a}_${b}`）upsert 一条 `matchType: 'event'` 的 matches，`scoreChange` 为 0，`status` 为 `completed`，不改 `users` 的积分和场次。友谊赛 `createMatch` 仍是记完立刻改积分。
- 历史约战胜负若还只在 `events.results` 里，`getUserProfile` 读取时按报名过的场次补进列表，已有同场同一对局的 matches 时以 matches 为准；补出来的行没有 `matches._id`，但仍带 `eventId`，点日期可以进该场赛程。这些补全只读不写库。
- 真人用户用软删除：给 `users.cancelled` 写 `true`，不物理删文档。名单、对战表、比赛记录仍可点进主页，主页只显示「已注销」。`getUserProfile` 对已注销或库里已经没有的人都返回 `cancelled`。排名和搜人会去掉已注销的人。真人注销入口还没做。虚拟球友列表的删除是硬删 users 文档（仅超管，已报名则拒绝）；删掉后再点进主页，也会显示「已注销」。
- 积分结算（整场结束后再给每局和合计入账）还没做。信用分不动。

## 虚拟球友

- 虚拟球友的 `openid` 以 `virtual` 开头，在 `users` 上用可选字段 `ownerOpenid` 记录创建人。新创建的一定带 `ownerOpenid`。旧数据可能没有主人。
- 管理页：`/pages/user/virtuals` 列表，`/pages/user/virtual-edit` 编辑或新建。从「我的」菜单「虚拟球友」进入，需登录。虚拟人主页上，主人（或可认领的无主人记录）以及超级管理员会看到「编辑资料」。
- 普通用户只能看到和修改「自己的 + 尚无主人的旧记录」。第一次编辑保存无主人记录时认领，写入 `ownerOpenid`；只打开列表不会批量认领。不能改别人已归属的虚拟球友。`updateUser` 仍只改当前登录者自己的真人资料。
- 超级管理员（openid `oNw7Y5E0Wkbx_ZqHgLNOAntmTp3g`，常量写在 `cloudfunctions/common/admin.ts`，各相关云函数内联同一份并在服务端校验）可以看全部虚拟球友，可新建、编辑、删除任何一个。编辑时不改 `ownerOpenid`（无主人的被超管编辑后仍保持无主人）。`isAdmin` 由 `getVirtualUsers` / `getUserProfile` 返回，不要把该 openid 写死在页面里当唯一判断。
- 删除只有超管能做（`deleteVirtualUser`）。若该虚拟球友已出现在任何 `signups` 里，拒绝删除并返回「已报名的虚拟球友不能删除」。目前产品只能自己取消报名，发起人还不能从名单里移除虚拟人，所以有报名记录就先不让删。不级联删除比赛或对阵。
- 约战「加虚拟球友」（`eventSchedule` 的 `addVirtual`）只从「我的池子 + 尚无主人的旧记录」里挑还没报这场的，不用别人已归属的。用到无主人旧记录时认领。新创建的带 `ownerOpenid`。号码按昵称「球友N」和已有 `virtual${n}` 往下取，避免冲突。
- `createVirtualUser` 只写入 `users`，不自动加进某场比赛。`updateVirtualUser` 改昵称/头像时写 `users`，并回填该 openid 的 `signups`，不回填 `matches` 快照，也不改积分和场次。昵称最多 20 字。头像库里存 `cloud://`，展示用临时 https。
- 排名和友谊赛把虚拟球友当成普通球友：`getRankings` 会把他们排进去，`searchUser` 能搜到他们，`createMatch` 记友谊赛分时走和真人相同的 Elo / 改积分 / 改胜负场逻辑。管理页、按 `ownerOpenid` 分池、超管权限仍在。新建虚拟球友（`createVirtualUser` 和 `eventSchedule` 的 `addVirtual`）初始积分与真人一样是 1000，场次/胜负从 0 起。旧虚拟球友若积分仍是 0 且还没打过比赛，用一次性云函数 `fixVirtualScores` 补成 1000；跑完可以从云开发控制台删掉该函数。
