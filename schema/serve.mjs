#!/usr/bin/env node
/**
 * Preact Schema Explorer：esbuild watch + serve。
 * 改 cloudfunctions/common/models.ts / UI 后刷新浏览器即可。
 */
import * as esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outdir = path.join(__dirname, '.serve')
const preferred = Number(process.env.SCHEMA_PORT || 5179)

fs.mkdirSync(outdir, { recursive: true })

const ctx = await esbuild.context({
  entryPoints: [path.join(__dirname, 'viewer.tsx')],
  bundle: true,
  format: 'esm',
  outfile: path.join(outdir, 'viewer.js'),
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  logLevel: 'info',
  jsx: 'automatic',
  jsxImportSource: 'preact',
})

await ctx.watch()

async function listen(startPort) {
  const maxTries = 20
  let lastErr
  for (let i = 0; i < maxTries; i++) {
    const port = startPort + i
    try {
      return await ctx.serve({ servedir: __dirname, port })
    } catch (err) {
      lastErr = err
      const msg = String(err && err.message ? err.message : err)
      if (!/address already in use|EADDRINUSE/i.test(msg)) throw err
      console.warn(`port ${port} in use, trying ${port + 1}…`)
    }
  }
  console.error(
    `\nFailed to bind ports ${startPort}–${startPort + maxTries - 1}.\n` +
      `Free the old schema:dev with:\n` +
      `  lsof -nP -iTCP:${startPort} -sTCP:LISTEN\n` +
      `  kill <pid>\n` +
      `Or set SCHEMA_PORT=5180 npm run schema:dev\n`
  )
  throw lastErr
}

const server = await listen(preferred)
const host =
  !server.host || server.host === '0.0.0.0' || server.host === '::'
    ? '127.0.0.1'
    : server.host
if (server.port !== preferred) {
  console.warn(`(preferred ${preferred} busy; using ${server.port})`)
}
console.log(
  `\nSchema viewer (Preact): http://${host}:${server.port}/\n改 cloudfunctions/common/models.ts 后刷新浏览器即可。\n`
)
