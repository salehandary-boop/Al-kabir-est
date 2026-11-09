// Makes sure the Electron program is downloaded and unpacked before the app starts.
// Newer npm versions skip Electron's own install script, and its unzip step can stop
// early on new Node versions. This script uses the operating system's own unzip tool.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const electronDir = path.dirname(require.resolve('electron/package.json'))
const { version } = require('electron/package.json')
const distDir = path.join(electronDir, 'dist')
const exeName = { win32: 'electron.exe', darwin: 'Electron.app/Contents/MacOS/Electron' }[process.platform] || 'electron'

function installed() {
  try {
    const v = fs.readFileSync(path.join(distDir, 'version'), 'utf8').replace(/^v/, '').trim()
    return v === version && fs.existsSync(path.join(distDir, exeName))
  } catch {
    return false
  }
}

async function main() {
  if (installed()) {
    fs.writeFileSync(path.join(electronDir, 'path.txt'), exeName)
    return
  }
  console.log(`Setting up Electron ${version} (one time, about 100 MB)...`)
  const { downloadArtifact } = require('@electron/get')
  const zip = await downloadArtifact({ version, artifactName: 'electron', platform: process.platform, arch: process.arch })
  console.log('Downloaded. Unpacking...')
  fs.rmSync(distDir, { recursive: true, force: true })
  fs.mkdirSync(distDir, { recursive: true })
  if (process.platform === 'linux') {
    execFileSync('unzip', ['-q', '-o', zip, '-d', distDir], { stdio: 'inherit' })
  } else {
    // Windows 10+ and macOS ship bsdtar, which unpacks zip files.
    execFileSync('tar', ['-xf', zip, '-C', distDir], { stdio: 'inherit' })
  }
  if (!installed()) throw new Error(`Electron unpacked but ${exeName} is missing in ${distDir}`)
  fs.writeFileSync(path.join(electronDir, 'path.txt'), exeName)
  console.log('Electron is ready.')
}

main().catch((err) => {
  console.error('Could not set up Electron:', err.message)
  process.exit(1)
})
