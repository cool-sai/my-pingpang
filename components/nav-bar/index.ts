import { getNavLayout } from '../../utils/nav'

Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    subtitle: {
      type: String,
      value: ''
    },
    /** dark=深色字；light=浅色字（压头图） */
    tone: {
      type: String,
      value: 'dark'
    },
    /** true：不占位，内容顶满屏 */
    overlay: {
      type: Boolean,
      value: false
    },
    scrolled: {
      type: Boolean,
      value: false
    },
    align: {
      type: String,
      value: 'left'
    },
    /** 顶栏左上角展示可点城市（首页上滑后） */
    showCity: {
      type: Boolean,
      value: false
    },
    city: {
      type: String,
      value: ''
    }
  },

  data: {
    statusBarHeight: 20,
    titleBarHeight: 44,
    navHeight: 64
  },

  lifetimes: {
    attached() {
      const layout = getNavLayout()
      this.setData(layout)
      this.triggerEvent('layout', layout)
    }
  },

  methods: {
    onCityTap() {
      this.triggerEvent('citytap')
    }
  }
})
