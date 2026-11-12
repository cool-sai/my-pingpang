// Exercise the actual handlers with an optimistic-transaction database double.
// Pauses force conflicting requests to read the same old version, then retry.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function fixture() {
  const docs = new Map()
  const versions = new Map()
  const key = (name, id) => `${name}/${id}`
  const put = (name, id, value) => {
    const k = key(name, id)
    if (value === null) docs.delete(k)
    else docs.set(k, structuredClone(value))
    versions.set(k, (versions.get(k) || 0) + 1)
  }
  const get = (name, id = 'e') => structuredClone(docs.get(key(name, id)) || null)
  put('events', 'e', {
    _id: 'e', creatorOpenid: 'owner', started: true, status: 'ongoing', settled: false,
    startTime: '2026-11-13 14:00', results: [], signupCount: 2
  })
  put('signups', 'e_a', { _id: 'e_a', eventId: 'e', openid: 'a', groupNo: 1 })
  put('signups', 'e_b', { _id: 'e_b', eventId: 'e', openid: 'b', groupNo: 1 })
  put('matches', 'e_a_b', { _id: 'e_a_b', eventId: 'e', scoreChange: { player1: 0, player2: 0 } })
  const hooks = { read: async () => {}, query: async () => {} }

  function collection(name, label, transaction) {
    return {
      doc(id) {
        const k = key(name, id)
        return {
          async get() {
            const data = get(name, id)
            if (transaction) {
              transaction.reads.set(k, versions.get(k) || 0)
              await hooks.read(label, name, id)
            }
            return { data }
          },
          async update({ data }) {
            const apply = () => {
              const current = get(name, id)
              if (!current) throw new Error('document missing')
              put(name, id, { ...current, ...data })
            }
            if (transaction) transaction.writes.push(apply)
            else apply()
            return { stats: { updated: 1 } }
          },
          async remove() { put(name, id, null) }
        }
      },
      where(filter) {
        return { limit(limit) { return { async get() {
          await hooks.query(label, name)
          const data = [...docs.entries()]
            .filter(([k, value]) => k.startsWith(`${name}/`) && Object.entries(filter).every(([field, expected]) => value[field] === expected))
            .slice(0, limit).map(([, value]) => structuredClone(value))
          return { data }
        } } } }
      }
    }
  }
  function client(label) {
    return {
      command: {}, serverDate: () => new Date(),
      collection: (name) => collection(name, label),
      async runTransaction(callback) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const transaction = { reads: new Map(), writes: [] }
          const result = await callback({ collection: (name) => collection(name, label, transaction) })
          if ([...transaction.reads].some(([k, version]) => (versions.get(k) || 0) !== version)) continue
          transaction.writes.forEach((apply) => apply())
          return result
        }
        throw new Error('too many transaction conflicts')
      }
    }
  }
  function load(name, label = name, reverseGeocode = async () => ({ province: '', city: '' })) {
    const extra = name === 'finishEvent' ? '\nexport { markFinished };' : ''
    const source = fs.readFileSync(`cloudfunctions/${name}/index.ts`, 'utf8') + extra
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    const mod = { exports: {} }
    const db = client(label)
    const requireMock = (id) => {
      if (id === 'wx-server-sdk') return { init() {}, database: () => db, getWXContext: () => ({ OPENID: 'owner' }) }
      if (id === './reverseGeocode') return reverseGeocode
      if (id === './rating') return { INITIAL_SCORE: 1000 }
      throw new Error(`unexpected import: ${id}`)
    }
    new Function('require', 'module', 'exports', code)(requireMock, mod, mod.exports)
    return mod.exports
  }
  return { hooks, put, get, load }
}

async function run() {
  // An already-closed event must keep both its event and child records.
  {
    const f = fixture()
    f.put('events', 'e', { ...f.get('events'), status: 'finished' })
    assert.equal((await f.load('deleteEvent').main({ id: 'e' })).success, false)
    assert.ok(f.get('events'))
    assert.ok(f.get('matches', 'e_a_b'))
  }
  // Delete reads ongoing, finish wins the commit, delete retries and stops.
  {
    const f = fixture(), read = deferred(), resume = deferred()
    let first = true
    f.hooks.read = async (label, name) => {
      if (label === 'deleteEvent' && name === 'events' && first) {
        first = false; read.resolve(); await resume.promise
      }
    }
    const removing = f.load('deleteEvent').main({ id: 'e' })
    await read.promise
    await f.load('finishEvent').markFinished('e', 'owner')
    resume.resolve()
    assert.equal((await removing).success, false)
    assert.equal(f.get('events').status, 'finished')
    assert.ok(f.get('signups', 'e_a'))
    assert.ok(f.get('matches', 'e_a_b'))
  }
  // Finish reads ongoing, deletion wins, finish retries while cleanup is paused.
  {
    const f = fixture(), read = deferred(), resume = deferred(), cleaning = deferred(), clean = deferred()
    let first = true
    f.hooks.read = async (label, name) => {
      if (label === 'finishEvent' && name === 'events' && first) {
        first = false; read.resolve(); await resume.promise
      }
    }
    f.hooks.query = async (label, name) => {
      if (label === 'deleteEvent' && name === 'signups') { cleaning.resolve(); await clean.promise }
    }
    const finishing = f.load('finishEvent').markFinished('e', 'owner')
    const rejected = assert.rejects(finishing, /比赛正在删除/)
    await read.promise
    const removing = f.load('deleteEvent').main({ id: 'e' })
    await cleaning.promise
    resume.resolve()
    await rejected
    assert.equal(f.get('events').deleting, true)
    assert.equal(f.get('events').status, 'ongoing')
    clean.resolve()
    assert.equal((await removing).success, true)
    assert.equal(f.get('events'), null)
    assert.equal(f.get('matches', 'e_a_b'), null)
  }
  // Failed cleanup keeps the marker and blocks settlement; deletion can resume.
  {
    const f = fixture()
    f.hooks.query = async () => { throw new Error('temporary read failure') }
    assert.equal((await f.load('deleteEvent').main({ id: 'e' })).success, false)
    assert.equal(f.get('events').deleting, true)
    await assert.rejects(f.load('finishEvent').markFinished('e', 'owner'), /比赛正在删除/)
    f.hooks.query = async () => {}
    assert.equal((await f.load('deleteEvent').main({ id: 'e' })).success, true)
    assert.equal(f.get('signups', 'e_a'), null)
    assert.equal(f.get('events'), null)
  }
  const input = {
    id: 'e', name: '编辑后的名称', startTime: '2026-11-13 15:00', status: 'ongoing',
    location: '球馆', latitude: 31, longitude: 121, format: '分段赛', maxPlayers: 0
  }
  // Close while geocoding is in flight: preserve the final status and time.
  {
    const f = fixture(), geocoding = deferred(), resume = deferred()
    const editing = f.load('updateEvent', 'edit', async () => {
      geocoding.resolve(); await resume.promise; return { province: '', city: '' }
    }).main(input)
    await geocoding.promise
    await f.load('finishEvent').markFinished('e', 'owner')
    resume.resolve()
    assert.equal((await editing).success, true)
    assert.equal(f.get('events').status, 'finished')
    assert.equal(f.get('events').startTime, '2026-11-13 14:00')
    assert.equal(f.get('events').name, input.name)
  }
  // An edit started earlier must not write to a deleting event.
  {
    const f = fixture()
    const result = await f.load('updateEvent', 'edit', async () => {
      f.put('events', 'e', { ...f.get('events'), deleting: true })
      return { province: '', city: '' }
    }).main(input)
    assert.equal(result.success, false)
    assert.match(result.error, /比赛正在删除/)
    assert.equal(f.get('events').startTime, '2026-11-13 14:00')
    assert.equal((await f.load('eventSchedule').main({ id: 'e', action: 'report', opponentOpenid: 'b', win: true })).success, false)
  }
  console.log('event lifecycle tests ok: competing delete/finish, cleanup recovery, stale edit, deletion guards')
}

run().catch((err) => { console.error(err); process.exitCode = 1 })
