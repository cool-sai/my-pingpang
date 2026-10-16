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

  login(callback?: ILoginCallback) {
    wx.getUserProfile({
      desc: '用于完善个人资料',
      success: async (res) => {
        try {
          const result = await callCloudFunction<IUserInfo>({
            name: 'login',
            data: {
              userInfo: res.userInfo
            }
          })

          const payload = result.result
          if (payload.success) {
            this.globalData.userInfo = payload.data
            this.globalData.openid = payload.data.openid || ''
            this.globalData.isLogin = true

            wx.setStorageSync('openid', payload.data.openid || '')
            wx.setStorageSync('userInfo', payload.data)

            callback?.success?.(payload.data)
          } else {
            callback?.fail?.(payload.error || '登录失败')
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : '登录失败'
          callback?.fail?.(message)
        }
      },
      fail: (err) => {
        callback?.fail?.(err.errMsg || '登录失败')
      }
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
