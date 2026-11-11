import { AVATAR_PLACEHOLDER } from '../../utils/avatar'

const virtualsApp = getApp<IAppOption>()

interface IVirtualUser {
  openid: string
  nickname: string
  avatar: string
  ownerOpenid?: string
}

interface IVirtualListResult {
  isAdmin?: boolean
  users?: IVirtualUser[]
}

Page({
  data: {
    placeholder: AVATAR_PLACEHOLDER,
    isLoading: true,
    isAdmin: false,
    users: [] as IVirtualUser[]
  },

  onShow() {
    if (!virtualsApp.globalData.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        confirmText: '去登录',
        success: (res) => {
          if (!res.confirm) {
            wx.navigateBack()
            return
          }
          virtualsApp.login({
            success: () => {
              void this.loadUsers()
            },
            fail: () => {
              wx.navigateBack()
            }
          })
        }
      })
      return
    }
    void this.loadUsers()
  },

  onPullDownRefresh() {
    void this.loadUsers().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadUsers() {
    if (!this.data.users.length) this.setData({ isLoading: true })
    try {
      const res = await virtualsApp.callFunction<IVirtualListResult>({
        name: 'getVirtualUsers'
      })
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' })
        return
      }
      const data = res.result.data || {}
      this.setData({
        isAdmin: !!data.isAdmin,
        users: Array.isArray(data.users) ? data.users : []
      })
    } catch (err) {
      console.error('加载虚拟球友失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ isLoading: false })
    }
  },

  goToCreate() {
    wx.navigateTo({ url: '/pages/user/virtual-edit' })
  },

  goToEdit(e: WechatMiniprogram.BaseEvent) {
    const openid = String((e.currentTarget.dataset && e.currentTarget.dataset.openid) || '')
    if (!openid || openid.indexOf('sk-') === 0) return
    wx.navigateTo({ url: `/pages/user/virtual-edit?openid=${openid}` })
  },

  onDelete(e: WechatMiniprogram.BaseEvent) {
    if (!this.data.isAdmin) return
    const openid = String((e.currentTarget.dataset && e.currentTarget.dataset.openid) || '')
    const nickname = String((e.currentTarget.dataset && e.currentTarget.dataset.nickname) || '球友')
    if (!openid) return
    wx.showModal({
      title: '删除虚拟球友',
      content: `确定删除「${nickname}」？已报名的不能删除。`,
      confirmText: '删除',
      confirmColor: '#d14343',
      success: (res) => {
        if (!res.confirm) return
        void this.deleteUser(openid)
      }
    })
  },

  async deleteUser(openid: string) {
    wx.showLoading({ title: '删除中' })
    try {
      const res = await virtualsApp.callFunction({
        name: 'deleteVirtualUser',
        data: { openid }
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '删除失败', icon: 'none' })
        return
      }
      this.setData({
        users: this.data.users.filter((item) => item.openid !== openid)
      })
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '删除失败', icon: 'none' })
      console.error(err)
    }
  }
})
