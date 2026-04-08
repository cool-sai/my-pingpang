// app.js
App({
  globalData: {
    userInfo: null,
    openid: '',
    isLogin: false
  },

  onLaunch() {
    // 初始化云开发 - 不需要require，直接用wx.cloud
    wx.cloud.init({
      env: 'cloud1-6g9iv061f644ffbc',
      traceUser: true
    })

    // 检查登录状态
    this.checkLogin()
  },

  // 检查登录状态
  checkLogin() {
    const openid = wx.getStorageSync('openid')
    const userInfo = wx.getStorageSync('userInfo')
    if (openid && userInfo) {
      this.globalData.openid = openid
      this.globalData.userInfo = userInfo
      this.globalData.isLogin = true
    }
  },

  // 云函数封装
  callFunction(options) {
    return wx.cloud.callFunction({
      name: options.name,
      data: options.data || {}
    })
  },

  // 用户登录
  login(callback) {
    wx.getUserProfile({
      desc: '用于完善个人资料',
      success: async (res) => {
        try {
          const result = await this.callFunction({
            name: 'login',
            data: {
              userInfo: res.userInfo
            }
          })

          if (result.result.success) {
            this.globalData.userInfo = result.result.data
            this.globalData.openid = result.result.data.openid
            this.globalData.isLogin = true

            wx.setStorageSync('openid', result.result.data.openid)
            wx.setStorageSync('userInfo', result.result.data)

            callback && callback.success && callback.success(result.result.data)
          } else {
            callback && callback.fail && callback.fail(result.result.error)
          }
        } catch (err) {
          callback && callback.fail && callback.fail(err.message)
        }
      },
      fail: (err) => {
        callback && callback.fail && callback.fail(err.message)
      }
    })
  }
})
