import { AVATAR_PLACEHOLDER } from '../../utils/avatar'

const editApp = getApp<IAppOption>()

interface IProfileUser {
  openid?: string
  nickname?: string
  avatar?: string
  isOwner?: boolean
  isAdmin?: boolean
}

interface IProfileResult {
  user?: IProfileUser
  missing?: boolean
}

Page({
  data: {
    placeholder: AVATAR_PLACEHOLDER,
    openid: '',
    nickname: '',
    avatar: '',
    pickedAvatar: '',
    isLoading: false,
    submitting: false,
    isCreate: true,
    missing: false
  },

  onLoad(query: Record<string, string | undefined>) {
    if (!editApp.globalData.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        confirmText: '去登录',
        success: (res) => {
          if (!res.confirm) {
            wx.navigateBack()
            return
          }
          editApp.login({
            success: () => {
              this.initPage(query)
            },
            fail: () => {
              wx.navigateBack()
            }
          })
        }
      })
      return
    }
    this.initPage(query)
  },

  initPage(query: Record<string, string | undefined>) {
    const openid = String((query && query.openid) || '').trim()
    const isCreate = !openid
    this.setData({ openid, isCreate, isLoading: !isCreate, missing: false })
    wx.setNavigationBarTitle({ title: isCreate ? '新建虚拟球友' : '编辑资料' })
    if (!isCreate) void this.loadUser(openid)
  },

  async loadUser(openid: string) {
    this.setData({ isLoading: true })
    try {
      const res = await editApp.callFunction<IProfileResult>({
        name: 'getUserProfile',
        data: { openid }
      })
      if (!res.result.success) {
        this.setData({ missing: true })
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' })
        return
      }
      const data = res.result.data || {}
      if (data.missing || !data.user) {
        this.setData({ missing: true })
        wx.showToast({ title: '没有这个虚拟球友', icon: 'none' })
        return
      }
      const user = data.user
      this.setData({
        nickname: user.nickname || '',
        avatar: user.avatar || ''
      })
    } catch (err) {
      console.error('加载虚拟球友失败', err)
      this.setData({ missing: true })
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ isLoading: false })
    }
  },

  chooseAvatar() {
    if (this.data.isLoading || this.data.submitting) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        this.setData({ pickedAvatar: file.tempFilePath })
      }
    })
  },

  clearAvatar() {
    this.setData({ pickedAvatar: '', avatar: '' })
  },

  async submit(e: WechatMiniprogram.CustomEvent<{ value?: { nickname?: string } }>) {
    if (this.data.submitting || this.data.isLoading || this.data.missing) return
    const nickname = String(e.detail.value && e.detail.value.nickname || '').trim()
    if (!this.data.isCreate && !nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    if (nickname.length > 20) {
      wx.showToast({ title: '昵称最多 20 字', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      let avatar = this.data.avatar
      if (this.data.pickedAvatar) {
        const key = this.data.openid || 'virtual'
        const uploaded = await wx.cloud.uploadFile({
          cloudPath: `avatars/${key}-${Date.now()}.jpg`,
          filePath: this.data.pickedAvatar
        })
        avatar = uploaded.fileID
      }

      const name = this.data.isCreate ? 'createVirtualUser' : 'updateVirtualUser'
      const payload: Record<string, unknown> = { nickname, avatar }
      if (!this.data.isCreate) payload.openid = this.data.openid
      const result = await editApp.callFunction({
        name,
        data: payload
      })
      if (!result.result.success) {
        this.setData({ submitting: false })
        wx.showToast({ title: result.result.error || '保存失败', icon: 'none' })
        return
      }

      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
          return
        }
        wx.navigateTo({ url: '/pages/user/virtuals' })
      }, 400)
    } catch (err) {
      this.setData({ submitting: false })
      const message = err instanceof Error ? err.message : '保存失败'
      wx.showToast({ title: message, icon: 'none' })
    }
  }
})
