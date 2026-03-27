import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoUpdater } from 'electron-updater';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devServerUrl = 'http://localhost:5173';

function setupAutoUpdater(win) {
  if (!app.isPackaged) return;

  const updateUrl = String(process.env.OFFOREST_UPDATE_URL || '').trim();
  if (updateUrl) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: updateUrl,
      channel: 'latest',
    });
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', async () => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Cập nhật ngay', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
      title: 'Có bản cập nhật mới',
      message: 'Bản cập nhật đã tải xong. Bạn muốn cài đặt ngay bây giờ không?',
    });

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] Error:', error);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[AutoUpdater] checkForUpdatesAndNotify failed:', error);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'app-dist', 'index.html'));
    return win;
  }

  win.loadURL(devServerUrl);
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  setupAutoUpdater(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});