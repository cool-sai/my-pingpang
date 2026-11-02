/**
 * 云数据库文档类型（轻量约束，不做运行时校验）。
 * 与同目录 `models.ts` 字段对齐；改 models 后请同步改这里。
 * 云函数：`import type { … } from '../common/types'`（编译期擦除，无需打包 common）。
 */

/** CloudBase `db.serverDate()` 返回值占位 */
export type ServerDateValue = unknown

export type EventFormat = '分段赛' | '淘汰赛' | '积分赛' | '循环赛'
export type EventStatus = 'upcoming' | 'ongoing' | 'finished'
export type MatchWinner = 'player1' | 'player2' | 'draw'

export interface Users {
  _id: string
  openid: string
  nickname: string
  avatar: string
  userNo: number
  profileReady: boolean
  score: number
  totalMatches: number
  winMatches: number
  loseMatches: number
  /** 首页筛选的省，可空 */
  province?: string
  /** 首页筛选的市，可空 */
  city?: string
  createTime: ServerDateValue
  updateTime: ServerDateValue
}

export interface Events {
  _id: string
  creatorOpenid: string
  creatorName: string
  name: string
  startTime: string
  /** 地图选点的名称；旧数据可能只有这段文字 */
  location: string
  /** 地图返回的详细地址，旧数据没有 */
  locationAddress?: string
  /** 纬度，旧数据没有 */
  latitude?: number
  /** 经度，旧数据没有 */
  longitude?: number
  /** 腾讯逆地址解析的省，旧数据没有 */
  province?: string
  /** 腾讯逆地址解析的市，旧数据没有 */
  city?: string
  description: string
  format: EventFormat
  status: EventStatus
  maxPlayers: number
  signupCount: number
  createTime: ServerDateValue
  updateTime: ServerDateValue
}

export interface MatchPlayerSnapshot {
  openid: string
  nickname: string
  avatar: string
  /** 本场比分（非 users.score 积分） */
  score: number
}

export interface Matches {
  _id: string
  player1Openid: string
  player2Openid: string
  player1: MatchPlayerSnapshot
  player2: MatchPlayerSnapshot
  scoreChange: {
    player1: number
    player2: number
  }
  winner: MatchWinner
  matchType: string
  location?: string
  status: string
  createTime: ServerDateValue
}

export interface Signups {
  _id: string
  eventId: string
  openid: string
  nickname: string
  avatar: string
  createTime: ServerDateValue
}

export interface Clubs {
  _id: string
  name: string
  city: string
  location: string
  description: string
  memberCount: number
  totalScore: number
  matchCount: number
}

/** 写入时 `_id` 由云库生成 */
export type UsersInsert = Omit<Users, '_id'>
export type EventsInsert = Omit<Events, '_id'>
export type MatchesInsert = Omit<Matches, '_id'>
export type SignupsInsert = Omit<Signups, '_id'>
export type ClubsInsert = Omit<Clubs, '_id'>

/** 创建、编辑约战时由调用方提交的字段 */
export type EventInput = Pick<
  Events,
  'name' | 'startTime' | 'location' | 'description' | 'format' | 'status' | 'maxPlayers'
> & {
  locationAddress: string
  latitude: number
  longitude: number
}

/** 编辑约战时实际写入的字段 */
export type EventsUpdate = EventInput & Pick<Events, 'updateTime'>

/** 资料页保存的字段 */
export type UsersProfilePatch = Pick<Users, 'nickname' | 'avatar' | 'profileReady' | 'updateTime'>

/** 首页筛选省市 */
export type UsersRegionPatch = Pick<Users, 'province' | 'city' | 'updateTime'>

/** counters 集合里 _id 为 userSeq 的文档 */
export interface UserSeq {
  n: number
}

/** 集合名 → 文档类型 */
export interface Collections {
  users: Users
  events: Events
  matches: Matches
  clubs: Clubs
}

export type CollectionName = keyof Collections
