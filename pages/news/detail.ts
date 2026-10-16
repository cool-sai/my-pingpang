import { newsList } from '../../data/news'

Page({
  data: {
    news: null as (typeof newsList)[number] | null
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      news: newsList.find((item) => item.id === query.id) || null
    })
  }
})
