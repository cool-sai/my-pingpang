declare function require(name: string): any

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database({
  throwOnNotFound: false
})
const INITIAL_SCORE = 1000
const COUNTER_ID = 'userSeq'

function errorText(err: unknown) {
  const error = err as { errMsg?: string; message?: string }
  return String(error?.errMsg || error?.message || '登录失败')
}

async function ensureCounter() {
  try {
    await db.createCollection('counters')
  } catch (err) {
    // 集合已经有了
  }

  const ref = db.collection('counters').doc(COUNTER_ID)
  const snap = await ref.get()
  if (snap.data && Number.isFinite(Number(snap.data.n))) return

  try {
    await ref.set({ data: { n: 0 } })
  } catch (err) {
    const again = await ref.get()
    if (!again.data) throw err
  }
}

async function allocateUserNo() {
  await ensureCounter()
  return db.runTransaction(async (transaction: any) => {
    const ref = transaction.collection('counters').doc(COUNTER_ID)
    const snap = await ref.get()
    const current = Number(snap.data && snap.data.n)
    if (!Number.isFinite(current) || current < 0) {
      throw new Error('序号计数损坏')
    }
    const next = current + 1
    await ref.update({ data: { n: next } })
    return next
  })
}

export const main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const userResult = await db.collection('users').where({
      openid
    }).get()

    if (userResult.data.length > 0) {
      return {
        success: true,
        data: userResult.data[0]
      }
    }

    const userNo = await allocateUserNo()
    const newUser = {
      openid,
      nickname: `用户${userNo}`,
      avatar: '',
      userNo,
      profileReady: false,
      score: INITIAL_SCORE,
      totalMatches: 0,
      winMatches: 0,
      loseMatches: 0,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    await db.collection('users').add({
      data: newUser
    })

    return {
      success: true,
      data: newUser
    }
  } catch (err) {
    return {
      success: false,
      error: errorText(err)
    }
  }
}
