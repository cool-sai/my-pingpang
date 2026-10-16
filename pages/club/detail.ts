const clubDetailApp = getApp<IAppOption>()

Page({
  data: {
    club: null as Record<string, any> | null,
    isLoading: true
  },

  onLoad(query: Record<string, string | undefined>) {
    void this.loadClub(query.id || '')
  },

  async loadClub(clubId: string) {
    try {
      const res = await clubDetailApp.callFunction<Array<Record<string, any>>>({
        name: 'getClubs',
        data: { sortBy: 'score' }
      })
      const club = (res.result.data || []).find((item) => item._id === clubId) || null
      this.setData({ club })
    } catch (err) {
      console.error('加载球馆失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  }
})
