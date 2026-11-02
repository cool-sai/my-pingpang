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
    summary: '在首页点进比赛，登录后即可报名',
    date: '2026-10-16',
    content: [
      '首页下方是正在进行和报名中的比赛，点进一场即可查看时间和地点。',
      '报名需要登录。登录后点底部的报名，名字会出现在这场比赛的报名名单里。',
      '已结束的比赛也在首页列表里。'
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
