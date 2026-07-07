const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')

let mainWindow
const stateUrl = process.env.NIU_STATE_URL || 'http://127.0.0.1:8787/state'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 428,
    minWidth: 560,
    minHeight: 315,
    transparent: true,
    frame: false,
    resizable: true,
    thickFrame: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.setAspectRatio(16 / 9)
  mainWindow.setMenuBarVisibility(false)

  const indexPath = path.join(__dirname, 'dist', 'index.html')
  mainWindow.loadFile(indexPath)

  const menu = Menu.buildFromTemplate([
    { label: 'Refresh', click: () => mainWindow?.webContents.reloadIgnoringCache() },
    { type: 'checkbox', label: 'Always on top', checked: true, click: item => mainWindow?.setAlwaysOnTop(item.checked) },
    { label: 'Open cloud state', click: () => shell.openExternal(stateUrl) },
    { type: 'separator' },
    { label: 'Exit', click: () => app.quit() }
  ])

  mainWindow.webContents.on('context-menu', () => {
    menu.popup({ window: mainWindow })
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
