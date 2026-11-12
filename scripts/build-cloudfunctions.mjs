import { mkdir, readdir, stat, copyFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const distRoot = path.join(rootDir, '.cloudfunctions-dist', 'cloudfunctions')
const functionsRoot = path.join(rootDir, 'cloudfunctions')

// Keep .cloudfunctions-dist: WeChat DevTools TS plugin reads compiled JS from outDir.
// Only copy each function's index.js back into cloudfunctions/<name>/ for upload/runtime.
const entries = await readdir(distRoot, { withFileTypes: true })

for (const entry of entries) {
  if (!entry.isDirectory()) continue

  const functionName = entry.name
  const builtDir = path.join(distRoot, functionName)
  const targetDir = path.join(functionsRoot, functionName)

  // 只拷有 index.js 的函数目录；同目录下的其它 .js（如 rating.js）一并带上，云函数运行时要 require
  try {
    const fileStat = await stat(path.join(builtDir, 'index.js'))
    if (!fileStat.isFile()) continue
  } catch {
    continue
  }

  await mkdir(targetDir, { recursive: true })
  const files = await readdir(builtDir, { withFileTypes: true })
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.js')) continue
    await copyFile(path.join(builtDir, file.name), path.join(targetDir, file.name))
  }
}
