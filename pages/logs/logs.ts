import { formatTime } from '../../utils/util'

Page({
  data: {
    logs: [] as Array<{ date: string; timeStamp: number }>
  },

  onLoad() {
    const logs = (wx.getStorageSync<number[]>('logs') || []).map((log) => ({
      date: formatTime(new Date(log)),
      timeStamp: log
    }))

    this.setData({ logs })
  }
})
