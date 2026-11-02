export type NavLayout = {
  statusBarHeight: number
  titleBarHeight: number
  navHeight: number
}

/** 自定义顶栏高度：状态栏 + 标题栏（对齐右侧胶囊） */
export function getNavLayout(): NavLayout {
  const windowInfo = typeof wx.getWindowInfo === 'function'
    ? wx.getWindowInfo()
    : wx.getSystemInfoSync()
  const statusBarHeight = Number(windowInfo.statusBarHeight) || 20
  let titleBarHeight = 44
  try {
    const menu = wx.getMenuButtonBoundingClientRect()
    if (menu && Number.isFinite(menu.height) && menu.height > 0 && Number.isFinite(menu.top)) {
      titleBarHeight = Math.max(44, (menu.top - statusBarHeight) * 2 + menu.height)
    }
  } catch (err) {
    // ignore
  }
  return {
    statusBarHeight,
    titleBarHeight,
    navHeight: statusBarHeight + titleBarHeight
  }
}
