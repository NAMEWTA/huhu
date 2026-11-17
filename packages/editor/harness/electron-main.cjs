// harness 的 Electron 入口：用本机 http 服务提供 harness-dist（file:// 下 module 脚本受 CORS 限制），窗口加载它。
const { app, BrowserWindow } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const DIST = path.resolve(__dirname, '../harness-dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' }

app.whenReady().then(() => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0])
    const file = path.join(DIST, rel === '/' ? 'index.html' : rel)
    if (!file.startsWith(DIST) || !fs.existsSync(file)) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  server.listen(0, '127.0.0.1', () => {
    const win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { contextIsolation: true } })
    win.loadURL(`http://127.0.0.1:${server.address().port}/${process.env.HARNESS_PAGE || ""}`)
  })
})
app.on('window-all-closed', () => app.quit())
