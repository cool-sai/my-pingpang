import { mkdir, readdir, rm, stat, copyFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const distRoot = path.join(rootDir, '.cloudfunctions-dist', 'cloudfunctions')
const functionsRoot = path.join(rootDir, 'cloudfunctions')

const entries = await readdir(distRoot, { withFileTypes: true })

for (const entry of entries) {
  if (!entry.isDirectory()) continue

  const functionName = entry.name
  const builtIndexPath = path.join(distRoot, functionName, 'index.js')
  const targetDir = path.join(functionsRoot, functionName)
  const targetIndexPath = path.join(targetDir, 'index.js')

  try {
    const fileStat = await stat(builtIndexPath)
    if (!fileStat.isFile()) continue
  } catch {
    continue
  }

  await mkdir(targetDir, { recursive: true })
  await copyFile(builtIndexPath, targetIndexPath)
}

await rm(path.join(rootDir, '.cloudfunctions-dist'), { recursive: true, force: true })
