import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronUpdaterPkg from 'electron-updater';

const { autoUpdater } = electronUpdaterPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devServerUrl = process.env.OFFOREST_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const promptsMoiFilePath = path.join(app.getPath('userData'), 'PromptsMoi.ts');

function parsePromptsMoiContent(fileText) {
  const source = String(fileText || '');
  const exportMatch = source.match(/export\s+const\s+PROMPTS_MOI[^=]*=\s*([\s\S]*?);\s*(?:export\s+default|$)/m);
  if (!exportMatch) return {};

  const jsonText = exportMatch[1]?.trim();
  if (!jsonText) return {};

  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function readPromptsMoi() {
  try {
    const raw = await fs.readFile(promptsMoiFilePath, 'utf8');
    return parsePromptsMoiContent(raw);
  } catch {
    return {};
  }
}

async function ensurePromptsMoiFile() {
  await fs.mkdir(path.dirname(promptsMoiFilePath), { recursive: true });

  try {
    await fs.access(promptsMoiFilePath);
  } catch {
    await writePromptsMoi({});
  }
}

async function writePromptsMoi(nextData) {
  await fs.mkdir(path.dirname(promptsMoiFilePath), { recursive: true });

  const content = [
    `export const PROMPTS_MOI: Record<string, string> = ${JSON.stringify(nextData, null, 2)};`,
    '',
    'export default PROMPTS_MOI;',
    '',
  ].join('\n');

  await fs.writeFile(promptsMoiFilePath, content, 'utf8');
}

function registerPromptIpc() {
  ipcMain.handle('prompts-moi:path', async () => {
    return promptsMoiFilePath;
  });

  ipcMain.handle('prompts-moi:load', async () => {
    return readPromptsMoi();
  });

  ipcMain.handle('prompts-moi:save', async (_event, payload) => {
    const promptKey = String(payload?.promptKey || '').trim();
    const promptValue = String(payload?.promptValue ?? '');
    if (!promptKey) return readPromptsMoi();

    const current = await readPromptsMoi();
    const next = {
      ...current,
      [promptKey]: promptValue,
    };

    await writePromptsMoi(next);
    return next;
  });

  ipcMain.handle('prompts-moi:remove', async (_event, payload) => {
    const promptKey = String(payload?.promptKey || '').trim();
    if (!promptKey) return readPromptsMoi();

    const current = await readPromptsMoi();
    const next = { ...current };
    delete next[promptKey];
    await writePromptsMoi(next);
    return next;
  });
}

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
      preload: path.join(__dirname, 'preload.js'),
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
  ensurePromptsMoiFile().catch((error) => {
    console.error('[PromptsMoi] Failed to initialize file:', error);
  });
  registerPromptIpc();
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