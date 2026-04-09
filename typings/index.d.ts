interface IUserInfo {
  avatar?: string
  nickname?: string
  openid?: string
  score?: number
  totalMatches?: number
  winMatches?: number
  loseMatches?: number
  [key: string]: any
}

interface IGlobalData {
  userInfo: IUserInfo | null
  openid: string
  isLogin: boolean
}

interface ICloudResponse<T> {
  success: boolean
  data: T
  error?: string
}

interface ICloudCallResult<T> extends WechatMiniprogram.CallFunctionResult {
  result: ICloudResponse<T>
}

interface ICallFunctionOptions {
  name: string
  data?: Record<string, unknown>
}

interface ILoginCallback {
  success?: (userInfo: IUserInfo) => void
  fail?: (error: string) => void
}

interface IAppOption {
  globalData: IGlobalData
  checkLogin: () => void
  callFunction: <T = any>(
    options: ICallFunctionOptions
  ) => Promise<ICloudCallResult<T>>
  login: (callback?: ILoginCallback) => void
}
