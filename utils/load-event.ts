export async function fetchEvent(
  app: IAppOption,
  id: string,
  withSignups = true
): Promise<{ event: Record<string, any> | null; error: string; missing: boolean }> {
  const eventId = String(id || '').trim()
  if (!eventId) return { event: null, error: '没有找到这场比赛', missing: true }
  try {
    const res = await app.callFunction<Record<string, any>>({
      name: 'getEvent',
      data: { id: eventId, withSignups }
    })
    if (!res.result.success || !res.result.data) {
      return {
        event: null,
        error: res.result.error || '没有找到这场比赛',
        missing: !!res.result.missing
      }
    }
    return { event: res.result.data, error: '', missing: false }
  } catch (err) {
    console.error('加载比赛失败', err)
    return { event: null, error: '没有找到这场比赛', missing: true }
  }
}
