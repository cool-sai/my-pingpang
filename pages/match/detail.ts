const matchDetailApp = getApp<IAppOption>()

Page({
  data: {
    match: null as Record<string, any> | null,
    isLoading: true
  },

  onLoad(query: Record<string, string | undefined>) {
    void this.loadMatch(query.id || '')
  },

  async loadMatch(matchId: string) {
    try {
      const res = await matchDetailApp.callFunction<Array<Record<string, any>>>({
        name: 'getMatches',
        data: { status: 'all' }
      })
      const match = (res.result.data || []).find((item) => item._id === matchId) || null
      this.setData({ match })
    } catch (err) {
      console.error('加载对阵失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  }
})
