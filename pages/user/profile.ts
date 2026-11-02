import { AVATAR_PLACEHOLDER } from '../../utils/avatar'

const profileApp = getApp<IAppOption>()

Page({
  data: {
    placeholder: AVATAR_PLACEHOLDER,
    nickname: '',
    avatar: '',
    pickedAvatar: '',
    required: false,
    submitting: false
  },

  onLoad(options: { required?: string }) {
    const user = profileApp.globalData.userInfo
    if (!profileApp.globalData.isLogin || !user) {
      wx.navigateBack()
      return
    }
    const required = options.required === '1' || !user.profileReady
    this.setData({
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      required
    })
    wx.setNavigationBarTitle({
      title: user.profileReady ? '修改资料' : '设置昵称'
    })
  },

  onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
    this.setData({ pickedAvatar: e.detail.avatarUrl || '' })
  },

  clearAvatar() {
    this.setData({ pickedAvatar: '', avatar: '' })
  },

  async submit(e: WechatMiniprogram.CustomEvent<{ value?: { nickname?: string } }>) {
    if (this.data.submitting) return
    const nickname = String(e.detail.value?.nickname || '').trim()
    if (!nickname) {
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
        const openid = profileApp.globalData.openid || 'user'
        const uploaded = await wx.cloud.uploadFile({
          cloudPath: `avatars/${openid}-${Date.now()}.jpg`,
          filePath: this.data.pickedAvatar
        })
        avatar = uploaded.fileID
      }

      const result = await profileApp.callFunction<IUserInfo>({
        name: 'updateUser',
        data: { nickname, avatar }
      })
      const payload = result.result
      if (!payload.success) {
        this.setData({ submitting: false })
        wx.showToast({ title: payload.error || '保存失败', icon: 'none' })
        return
      }

      profileApp.saveUser(payload.data)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
          return
        }
        wx.switchTab({ url: '/pages/user/user' })
      }, 400)
    } catch (err) {
      this.setData({ submitting: false })
      const message = err instanceof Error ? err.message : '保存失败'
      wx.showToast({ title: message, icon: 'none' })
    }
  }
})
