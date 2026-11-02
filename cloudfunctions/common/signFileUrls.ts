/**
 * 云存储 fileID → 临时 https。
 * DB 仍存 cloud://；仅接口返回展示用 URL。不管过期、不写缓存。
 * 注意：common 不随单个云函数上传，各函数内会内联同逻辑；
 * 改这里时请同步 getEvents / getHomeData / getEvent / signupEvent。
 */

const BATCH = 50

type TempItem = { fileID?: string; tempFileURL?: string; status?: number | string }

type CloudSdk = {
  getTempFileURL: (opts: { fileList: string[] }) => Promise<{ fileList?: TempItem[] }>
}

function isOkTemp(item?: TempItem) {
  if (!item) return ''
  const url = String(item.tempFileURL || '')
  if (url.indexOf('https://') !== 0) return ''
  if (item.status !== undefined && item.status !== 0 && String(item.status) !== '0') return ''
  return url
}

/** 批量：只处理 cloud://；返回 fileID → https */
export async function signFileUrls(cloud: CloudSdk, fileIDs: string[]): Promise<Map<string, string>> {
  const cloudIDs = Array.from(new Set(fileIDs.filter((id) => id && id.indexOf('cloud://') === 0)))
  const urls = new Map<string, string>()
  for (let i = 0; i < cloudIDs.length; i += BATCH) {
    const batch = cloudIDs.slice(i, i + BATCH)
    let list: TempItem[] = []
    try {
      const res = await cloud.getTempFileURL({ fileList: batch })
      list = (res && res.fileList) || []
    } catch (err) {
      console.error('换取临时链接失败', err)
    }
    batch.forEach((fileID, index) => {
      const url = isOkTemp(list[index])
      if (url) urls.set(fileID, url)
    })
  }
  return urls
}

/**
 * 单个：空 → 空；已是 https → 原样；cloud:// → 临时 https；其它 → 空
 */
export async function resolveTempUrl(cloud: CloudSdk, value: string): Promise<string> {
  const fileID = String(value || '')
  if (!fileID) return ''
  if (fileID.indexOf('https://') === 0) return fileID
  if (fileID.indexOf('cloud://') !== 0) return ''
  const urls = await signFileUrls(cloud, [fileID])
  return urls.get(fileID) || ''
}

export async function withCoverUrls<T extends { cover?: string }>(
  cloud: CloudSdk,
  items: T[]
): Promise<Array<T & { coverUrl: string }>> {
  const urls = await signFileUrls(cloud, items.map((item) => String(item.cover || '')))
  return items.map((item) => {
    const fileID = String(item.cover || '')
    const coverUrl = urls.get(fileID) || (fileID.indexOf('https://') === 0 ? fileID : '')
    return { ...item, coverUrl }
  })
}
