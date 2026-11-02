const https = require('https')

function reverseGeocode(latitude, longitude) {
  let key = ''
  try {
    key = require('./map-key')
  } catch (err) {
    key = ''
  }
  if (!key) {
    return Promise.reject(new Error('未配置地图 Key'))
  }

  const url =
    'https://apis.map.qq.com/ws/geocoder/v1/?location=' +
    encodeURIComponent(String(latitude) + ',' + String(longitude)) +
    '&key=' +
    encodeURIComponent(key)

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          let body
          try {
            body = JSON.parse(raw)
          } catch (err) {
            reject(new Error('地址解析失败'))
            return
          }
          if (!body || body.status !== 0) {
            reject(new Error(body && body.status === 121
              ? '地图额度已用完，请到腾讯位置服务给 Key 分配额度'
              : (body && body.message) || '地址解析失败'))
            return
          }
          const part = (body.result && body.result.address_component) || {}
          const province = String(part.province || '').trim()
          const city = String(part.city || part.district || '').trim()
          if (!province || !city) {
            reject(new Error('没有解析出省市'))
            return
          }
          resolve({ province, city })
        })
      })
      .on('error', () => {
        reject(new Error('地址解析失败'))
      })
  })
}

module.exports = reverseGeocode
