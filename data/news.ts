export interface INews {
  id: string
  title: string
  summary: string
  date: string
  cover?: string
  content: string[]
}

// 首页轮播。改这一份列表即可：有 cover 时用图片，没有就用纯色底。
export const newsList: INews[] = [
  {
    id: 'signup-guide',
    title: '怎么报名一场比赛',
    summary: '打开赛事，登录后即可报名',
    date: '2026-10-16',
    content: [
      '首页下方是正在进行和报名中的比赛，点进一场即可查看时间和地点。',
      '报名需要登录。登录后点底部的报名，记录会留在这台手机上。',
      '更多状态，比如已结束的比赛，到「赛事」页查看。'
    ]
  },
  {
    id: 'credit-rule',
    title: '信用分从 80 分开始',
    summary: '报名后请按时到场',
    date: '2026-10-16',
    content: [
      '新用户信用分从 80 分起算，在「我的」里可以查看。',
      '报名后无故缺席会扣分。暂时还不能到场，请先不要报名。',
      '扣分和加分的完整规则会在后续版本补上。'
    ]
  }
]
