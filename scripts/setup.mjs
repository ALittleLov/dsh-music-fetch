#!/usr/bin/env node
/**
 * 一键检查/准备第三方依赖。
 *
 * - QQ 音乐：是 npm 包，`npm install` 已装好，这里只检查。
 * - 酷狗：不是 npm 包，需要把上游项目放到 vendor/kugou。
 *   默认只提示；加 --with-kugou 会尝试 clone 并安装（需要能访问 GitHub）。
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const withKugou = process.argv.includes('--with-kugou')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

console.log('[setup] 检查第三方依赖…')

// 1) QQ：npm 包
const qqEntry = join(ROOT, 'node_modules', '@yakult-green-tea', 'qq-music-api', 'dist', 'src', 'app.js')
if (existsSync(qqEntry)) {
  console.log('[setup] QQ 音乐：已就绪')
} else {
  console.log('[setup] QQ 音乐：未安装，请运行  npm install')
}

// 2) 酷狗：vendor 目录
const kugouDir = join(ROOT, 'vendor', 'kugou')
if (existsSync(join(kugouDir, 'index.js'))) {
  console.log('[setup] 酷狗音乐：已就绪（上游接口目前不可用，渠道已标记）')
} else if (withKugou) {
  console.log('[setup] 酷狗音乐：尝试克隆上游项目…')
  mkdirSync(join(ROOT, 'vendor'), { recursive: true })
  const clone = spawnSync('git', [
    'clone', '--depth', '1', 'https://github.com/MakcRe/KuGouMusicApi', kugouDir,
  ], { stdio: 'inherit' })
  if (clone.status !== 0) {
    console.log('[setup] 克隆失败（网络或 git 不可用）。可以手动执行：')
    console.log('  git clone --depth 1 https://github.com/MakcRe/KuGouMusicApi vendor/kugou')
  } else {
    console.log('[setup] 安装酷狗服务依赖…')
    const ins = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: kugouDir, stdio: 'inherit', shell: process.platform === 'win32',
    })
    if (ins.status !== 0) console.log('[setup] 酷狗依赖安装失败，请手动在 vendor/kugou 里 npm install')
    else console.log('[setup] 酷狗音乐：已就绪')
  }
} else {
  console.log('[setup] 酷狗音乐：未安装（该渠道当前不可用，跳过不影响网易云/QQ）')
  console.log('[setup] 需要时运行  npm run setup:kugou')
}

console.log('[setup] 完成。')
