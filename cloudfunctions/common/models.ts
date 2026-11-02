/**
 * Schema-as-Code — 云数据库唯一真相来源（cloudfunctions/common）。
 * 改字段 / 关系只动这里，再跑 `npm run schema:dev` 在浏览器里实时查看。
 * 文档 TS 类型见同目录 `types.ts`。
 *
 * 约定：
 * - key: 业务主键（openid）或文档 _id
 * - ref: 逻辑外键（云库无真正 FK）
 * - copyFrom: 写入时从目标字段抄一份
 *
 * 重要：denorm 不会回填。
 * updateUser 改 nickname/avatar 后，已有 events.creatorName、matches.player1/2 快照不会自动更新。
 */

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'serverDate'
  | 'enum'
  | 'object'

/** collection.field 路径，如 users.openid */
export type FieldPath = string

export interface FieldDef {
  type: FieldType
  note?: string
  /** 作为连线端口 */
  port?: boolean
  /** 被其它集合抄走（视觉高亮） */
  copied?: boolean
  optional?: boolean
  /** 逻辑外键目标 */
  ref?: FieldPath
  /** 写入时抄自（单字段或多字段） */
  copyFrom?: FieldPath | FieldPath[]
  /** enum 取值 */
  values?: string[]
  /** object 子字段 */
  fields?: Record<string, FieldDef>
  /** 卡片里多行说明 */
  detail?: string
}

export interface CollectionDef {
  label: string
  blurb: string
  key: string
  fields: Record<string, FieldDef>
  highlight?: boolean
  dashed?: boolean
}

export interface AuxiliaryDocDef {
  fields: Record<string, FieldDef>
}

export interface AuxiliaryCollectionDef {
  blurb: string
  docs: Record<string, AuxiliaryDocDef>
}

export type EdgeKind = 'ref' | 'copy'
export type EdgeStyle = 'straight' | 'bus'

export interface SchemaEdge {
  kind: EdgeKind
  from: FieldPath | FieldPath[]
  to: FieldPath | FieldPath[]
  label: string
  style: EdgeStyle
  railPad?: number
  lane?: number
}

export interface SchemaMeta {
  title: string
  product: string
  blurb: string
}

export interface SchemaLayout {
  top: string[]
  bottom: string[]
}

export interface SchemaModel {
  meta: SchemaMeta
  collections: Record<string, CollectionDef>
  auxiliaries: Record<string, AuxiliaryCollectionDef>
  footnotes: string[]
  edges: SchemaEdge[]
  layout: SchemaLayout
}

export const schema: SchemaModel = {
  meta: {
    title: '云数据库结构',
    product: '乒乓球约战',
    blurb: '按当前云函数的写入和读取整理。线从引用字段连到被引用字段。按住一张表可以拖动。',
  },

  collections: {
    users: {
      label: '球友',
      blurb: '登录时创建。资料页改昵称和头像',
      key: 'openid',
      highlight: true,
      fields: {
        _id: { type: 'string', note: '文档 id' },
        openid: { type: 'string', note: '业务主键', port: true },
        nickname: { type: 'string', note: '会被抄走', port: true, copied: true },
        avatar: { type: 'string', note: '会被抄走，可空', port: true, copied: true },
        userNo: { type: 'number', note: '注册序号' },
        profileReady: { type: 'boolean', note: '是否保存过资料' },
        score: { type: 'number', note: '积分，初始 1000' },
        totalMatches: { type: 'number', note: '场次' },
        winMatches: { type: 'number', note: '胜' },
        loseMatches: { type: 'number', note: '负' },
        province: { type: 'string', note: '首页筛选的省，可空', optional: true },
        city: { type: 'string', note: '首页筛选的市，可空', optional: true },
        createTime: { type: 'serverDate', note: '服务器时间' },
        updateTime: { type: 'serverDate', note: '服务器时间' },
      },
    },

    events: {
      label: '约战',
      blurb: '创建、编辑、删除比赛',
      key: '_id',
      fields: {
        _id: { type: 'string', note: '文档 id', port: true },
        creatorOpenid: {
          type: 'string',
          note: '发起人',
          port: true,
          ref: 'users.openid',
        },
        // denorm：创建时抄 nickname；updateUser 后不回填
        creatorName: {
          type: 'string',
          note: '抄昵称',
          port: true,
          copyFrom: 'users.nickname',
        },
        cover: { type: 'string', note: '封面 cloud:// fileID，列表与详情顶图；旧数据可空', optional: true },
        name: { type: 'string', note: '最多 30 字' },
        startTime: { type: 'string', note: 'YYYY-MM-DD HH:mm' },
        location: { type: 'string', note: '地图选点的名称，最多 80 字' },
        locationAddress: { type: 'string', note: '详细地址，最多 120 字', optional: true },
        latitude: { type: 'number', note: '纬度，新建必填', optional: true },
        longitude: { type: 'number', note: '经度，新建必填', optional: true },
        province: { type: 'string', note: '省，逆地址解析写入', optional: true },
        city: { type: 'string', note: '市，逆地址解析写入，首页按此筛选', optional: true },
        description: { type: 'string', note: '最多 300 字' },
        format: {
          type: 'enum',
          values: ['分段赛', '淘汰赛', '积分赛', '循环赛'],
          note: '新建选分段赛或淘汰赛。旧数据还有积分赛、循环赛',
        },
        status: {
          type: 'enum',
          values: ['upcoming', 'ongoing', 'finished'],
          note: 'upcoming / ongoing / finished',
        },
        maxPlayers: { type: 'number', note: '0 为不限' },
        signupCount: { type: 'number', note: '报名时加一' },
        createTime: { type: 'serverDate', note: '服务器时间' },
        updateTime: { type: 'serverDate', note: '服务器时间' },
      },
    },

    signups: {
      label: '报名',
      blurb: '一场比赛里的报名记录，一人一条',
      key: '_id',
      fields: {
        _id: { type: 'string', note: 'eventId 加 openid' },
        eventId: {
          type: 'string',
          note: '哪场比赛',
          port: true,
          ref: 'events._id',
        },
        openid: {
          type: 'string',
          note: '报名人',
          port: true,
          ref: 'users.openid',
        },
        nickname: {
          type: 'string',
          note: '报名时抄昵称',
          port: true,
          copyFrom: 'users.nickname',
        },
        avatar: {
          type: 'string',
          note: '报名时抄的 cloud:// 文件号，可空',
          port: true,
          copyFrom: 'users.avatar',
        },
        avatarUrl: { type: 'string', note: '旧字段：曾缓存临时 https，现读名单时现签，不再写入', optional: true },
        avatarExpire: { type: 'number', note: '旧字段：临时链到期毫秒，现不再写入/读取', optional: true },
        avatarMaxAge: { type: 'number', note: '旧字段：曾存 maxAge，现不再写入/读取', optional: true },
        createTime: { type: 'serverDate', note: '服务器时间' },
      },
    },

    matches: {
      label: '对阵',
      blurb: '记一场一对一比分',
      key: '_id',
      fields: {
        _id: { type: 'string', note: '文档 id' },
        player1Openid: {
          type: 'string',
          note: '记录人',
          port: true,
          ref: 'users.openid',
        },
        player2Openid: {
          type: 'string',
          note: '对手',
          port: true,
          ref: 'users.openid',
        },
        // denorm 快照：nickname/avatar 从 users 抄；score 是本场比分，不是 users.score
        // updateUser 后不回填
        player1: {
          type: 'object',
          note: '快照',
          port: true,
          copyFrom: ['users.nickname', 'users.avatar'],
          fields: {
            openid: { type: 'string', copyFrom: 'users.openid' },
            nickname: { type: 'string', copyFrom: 'users.nickname' },
            avatar: { type: 'string', copyFrom: 'users.avatar' },
            score: { type: 'number', note: '本场比分（非积分）' },
          },
          detail: 'openid、nickname、avatar、score',
        },
        player2: {
          type: 'object',
          note: '快照',
          port: true,
          copyFrom: ['users.nickname', 'users.avatar'],
          fields: {
            openid: { type: 'string', copyFrom: 'users.openid' },
            nickname: { type: 'string', copyFrom: 'users.nickname' },
            avatar: { type: 'string', copyFrom: 'users.avatar' },
            score: { type: 'number', note: '本场比分（非积分）' },
          },
          detail: '字段与 player1 相同',
        },
        scoreChange: {
          type: 'object',
          note: '积分增减',
          detail: 'player1、player2',
          fields: {
            player1: { type: 'number' },
            player2: { type: 'number' },
          },
        },
        winner: {
          type: 'enum',
          values: ['player1', 'player2', 'draw'],
          note: 'player1 / player2 / draw',
        },
        matchType: { type: 'string', note: '现为 friendly' },
        location: { type: 'string', note: '可空', optional: true },
        status: { type: 'string', note: '写入为 completed' },
        createTime: { type: 'serverDate', note: '服务器时间' },
      },
    },

    clubs: {
      label: '球馆',
      blurb: '只有查询。和 users、events、matches 都没有外键。',
      key: '_id',
      dashed: true,
      fields: {
        _id: { type: 'string', note: '文档 id' },
        name: { type: 'string', note: '名称' },
        city: { type: 'string', note: '城市' },
        location: { type: 'string', note: '地点' },
        description: { type: 'string', note: '介绍' },
        memberCount: { type: 'number', note: '按人数排序' },
        totalScore: { type: 'number', note: '按总积分排序' },
        matchCount: { type: 'number', note: '比赛场次' },
      },
    },
  },

  auxiliaries: {
    counters: {
      blurb: '注册序号来源',
      docs: {
        userSeq: {
          fields: {
            n: { type: 'number', note: '事务里加一' },
          },
        },
      },
    },
  },

  footnotes: [
    '注册序号来自 <code class="text-stone-800">counters</code> 里的一条文档 <code class="text-stone-800">userSeq</code>，字段 <code class="text-stone-800">n</code> 在事务里加一。',
    '报名在 <code class="text-stone-800">signups</code>。文档 id 是比赛 id 加 openid。<code class="text-stone-800">signupEvent</code> 写入时把 <code class="text-stone-800">events.signupCount</code> 加一。',
    '<code class="text-stone-800">users.score</code> 是积分。<code class="text-stone-800">matches.player1.score</code> 是本场比分。',
    '页面上的信用分 <code class="text-stone-800">creditScore</code> 不在 <code class="text-stone-800">users</code> 里，读不到时按 80 显示。',
    'denorm 不回填：改昵称/头像后，旧的 <code class="text-stone-800">events.creatorName</code> 与 <code class="text-stone-800">matches.player*</code> 快照不会自动更新。',
  ],

  edges: [
    {
      kind: 'ref',
      from: 'signups.eventId',
      to: 'events._id',
      label: 'eventId',
      style: 'straight',
    },
    {
      kind: 'ref',
      from: 'signups.openid',
      to: 'users.openid',
      label: 'openid',
      style: 'straight',
    },
    {
      kind: 'copy',
      from: 'signups.nickname',
      to: 'users.nickname',
      label: '报名时抄昵称',
      style: 'straight',
    },
    {
      kind: 'ref',
      from: 'events.creatorOpenid',
      to: 'users.openid',
      label: 'creatorOpenid',
      style: 'straight',
    },
    {
      kind: 'copy',
      from: 'events.creatorName',
      to: 'users.nickname',
      label: '创建时抄昵称',
      style: 'straight',
    },
    {
      kind: 'ref',
      from: ['matches.player1Openid', 'matches.player2Openid'],
      to: ['users.openid'],
      label: 'player1 / player2',
      style: 'bus',
      railPad: 16,
      lane: -28,
    },
    {
      kind: 'copy',
      from: ['matches.player1', 'matches.player2'],
      to: ['users.nickname', 'users.avatar'],
      label: '抄昵称、头像',
      style: 'bus',
      railPad: 36,
      lane: 28,
    },
  ],

  layout: {
    top: ['events', 'signups', 'users', 'matches'],
    bottom: ['clubs'],
  },
}

export default schema
