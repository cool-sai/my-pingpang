#!/usr/bin/env node
/**
 * Preact Schema Explorer：esbuild watch + serve。
 * 改 models.ts / UI 后刷新浏览器即可。
 */
import * as esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outdir = path.join(__dirname, '.serve')
const port = Number(process.env.SCHEMA_PORT || 5179)

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
const server = await ctx.serve({
  servedir: __dirname,
  port,
})

const host = server.host === '0.0.0.0' ? '127.0.0.1' : server.host
console.log(`\nSchema viewer (Preact): http://${host}:${server.port}/\n改 schema/models.ts 后刷新浏览器即可。\n`)
