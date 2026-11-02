const callCloudFunction = <T = any>(
  options: ICallFunctionOptions
): Promise<ICloudCallResult<T>> => {
  return wx.cloud.callFunction({
    name: options.name,
    data: options.data || {}
  }) as unknown as Promise<ICloudCallResult<T>>
}

const appConfig = {
  globalData: {
    userInfo: null,
    openid: '',
    isLogin: false
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-6g9iv061f644ffbc',
      traceUser: true
    })

    this.checkLogin()
  },

  checkLogin() {
    const openid = wx.getStorageSync<string>('openid')
    const userInfo = wx.getStorageSync<IUserInfo>('userInfo')

    if (openid && userInfo) {
      this.globalData.openid = openid
      this.globalData.userInfo = userInfo
      this.globalData.isLogin = true
    }
  },

  callFunction<T = any>(options: ICallFunctionOptions) {
    return callCloudFunction<T>(options)
  },

  saveUser(userInfo: IUserInfo) {
    this.globalData.userInfo = userInfo
    this.globalData.openid = userInfo.openid || ''
    this.globalData.isLogin = true
    wx.setStorageSync('openid', userInfo.openid || '')
    wx.setStorageSync('userInfo', userInfo)
  },

  requireLogin(reason: string, callback?: ILoginCallback) {
    if (this.globalData.isLogin && this.globalData.userInfo) {
      if (!this.globalData.userInfo.profileReady) {
        wx.navigateTo({ url: '/pages/user/profile?required=1' })
        return
      }
      callback?.success?.(this.globalData.userInfo)
      return
    }

    wx.showModal({
      title: '需要登录',
      content: reason,
      confirmText: '登录',
      success: (res) => {
        if (!res.confirm) {
          callback?.fail?.('取消登录')
          return
        }
        this.login({
          success: (userInfo) => {
            if (!userInfo.profileReady) {
              wx.navigateTo({ url: '/pages/user/profile?required=1' })
              return
            }
            callback?.success?.(userInfo)
          },
          fail: (error) => callback?.fail?.(error)
        })
      }
    })
  },

  login(callback?: ILoginCallback) {
    void callCloudFunction<IUserInfo>({ name: 'login' })
      .then((result) => {
        const payload = result.result
        if (!payload.success) {
          callback?.fail?.(payload.error || '登录失败')
          return
        }
        this.saveUser(payload.data)
        callback?.success?.(payload.data)
      })
      .catch((err: unknown) => {
        const error = err as { errMsg?: string; message?: string }
        callback?.fail?.(error?.errMsg || error?.message || '登录失败')
      })
  },

  logout() {
    this.globalData.userInfo = null
    this.globalData.openid = ''
    this.globalData.isLogin = false
    wx.removeStorageSync('openid')
    wx.removeStorageSync('userInfo')
  }
}

App(appConfig)
