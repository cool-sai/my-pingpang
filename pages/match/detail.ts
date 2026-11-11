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
    const id = String(matchId || '').trim()
    if (!id) {
      this.setData({ match: null, isLoading: false })
      return
    }
    try {
      const res = await matchDetailApp.callFunction<Array<Record<string, any>>>({
        name: 'getMatches',
        data: { id }
      })
      const match = (res.result && res.result.success ? (res.result.data || [])[0] : null) || null
      this.setData({ match })
    } catch (err) {
      console.error('加载对阵失败', err)
      this.setData({ match: null })
    } finally {
      this.setData({ isLoading: false })
    }
  }
})
