const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ELO评分系统参数
const K_FACTOR = 32  // 新手局K值（用于1500分以下）
const K_FACTOR_PRO = 16  // 专业局K值（用于1500分以上）
const INITIAL_SCORE = 1000

// 计算预期胜率
function getExpectedScore(playerScore, opponentScore) {
  return 1 / (1 + Math.pow(10, (opponentScore - playerScore) / 400))
}

// 获取K值
function getKFactor(score) {
  return score < 1500 ? K_FACTOR : K_FACTOR_PRO
}

// 计算新积分
function calculateNewScore(playerScore, opponentScore, actualScore) {
  const expected = getExpectedScore(playerScore, opponentScore)
  const k = getKFactor(playerScore)
  return Math.round(playerScore + k * (actualScore - expected))
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { opponentOpenid, player1Score, player2Score, location, matchType = 'friendly' } = event

  // 参数校验
  if (!opponentOpenid || player1Score === undefined || player2Score === undefined) {
    return { success: false, error: '参数不完整' }
  }

  if (player1Score < 0 || player2Score < 0) {
    return { success: false, error: '比分不能为负数' }
  }

  // 不能和自己比赛
  if (openid === opponentOpenid) {
    return { success: false, error: '不能和自己比赛' }
  }

  try {
    // 获取双方用户信息
    const [player1Res, player2Res] = await Promise.all([
      db.collection('users').where({ openid }).get(),
      db.collection('users').where({ openid: opponentOpenid }).get()
    ])

    if (!player1Res.data.length || !player2Res.data.length) {
      return { success: false, error: '用户不存在' }
    }

    const player1 = player1Res.data[0]
    const player2 = player2Res.data[0]

    // 确定胜负
    const p1Wins = player1Score > player2Score
    const p2Wins = player2Score > player1Score
    const isDraw = player1Score === player2Score

    // 计算积分变化
    let p1ScoreChange = 0
    let p2ScoreChange = 0
    let newP1Score = player1.score
    let newP2Score = player2.score

    if (!isDraw) {
      if (p1Wins) {
        p1ScoreChange = calculateNewScore(player1.score, player2.score, 1) - player1.score
        p2ScoreChange = calculateNewScore(player2.score, player1.score, 0) - player2.score
      } else {
        p1ScoreChange = calculateNewScore(player1.score, player2.score, 0) - player1.score
        p2ScoreChange = calculateNewScore(player2.score, player1.score, 1) - player2.score
      }
      newP1Score = player1.score + p1ScoreChange
      newP2Score = player2.score + p2ScoreChange
    }

    const winner = p1Wins ? 'player1' : p2Wins ? 'player2' : 'draw'

    // 创建比赛记录
    const match = {
      player1Openid: openid,
      player2Openid: opponentOpenid,
      player1: {
        openid: openid,
        nickname: player1.nickname,
        avatar: player1.avatar,
        score: player1Score
      },
      player2: {
        openid: opponentOpenid,
        nickname: player2.nickname,
        avatar: player2.avatar,
        score: player2Score
      },
      scoreChange: {
        player1: p1ScoreChange,
        player2: p2ScoreChange
      },
      winner,
      matchType,
      location,
      status: 'completed',
      createTime: db.serverDate()
    }

    const matchRes = await db.collection('matches').add({ data: match })

    // 更新双方用户积分和战绩
    await Promise.all([
      db.collection('users').where({ openid }).update({
        data: {
          score: newP1Score,
          totalMatches: db.command.inc(1),
          winMatches: p1Wins ? db.command.inc(1) : 0,
          loseMatches: p2Wins ? db.command.inc(1) : 0,
          updateTime: db.serverDate()
        }
      }),
      db.collection('users').where({ openid: opponentOpenid }).update({
        data: {
          score: newP2Score,
          totalMatches: db.command.inc(1),
          winMatches: p2Wins ? db.command.inc(1) : 0,
          loseMatches: p1Wins ? db.command.inc(1) : 0,
          updateTime: db.serverDate()
        }
      })
    ])

    return {
      success: true,
      data: {
        matchId: matchRes._id,
        winner,
        scoreChange: { player1: p1ScoreChange, player2: p2ScoreChange },
        newScores: { player1: newP1Score, player2: newP2Score }
      }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
