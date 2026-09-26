import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import electronUpdaterPkg from 'electron-updater';
import { readPsd, initializeCanvas } from 'ag-psd';
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);
const PSD = require('psd');
const { PNG } = require('pngjs');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const { autoUpdater } = electronUpdaterPkg;

for (const outputStream of [process.stdout, process.stderr]) {
  outputStream.on('error', (error) => {
    if (error?.code !== 'EPIPE') return;
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Local worker settings in this project's .env must override stale system variables.
dotenv.config({ path: path.join(__dirname, '.env'), override: true, quiet: true });
const devServerUrl = process.env.OFFOREST_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const promptsMoiFilePath = path.join(app.getPath('userData'), 'PromptsMoi.ts');
const LOCAL_MOCKUP_WORKER_CONFIG_FILE = 'local-mockup-worker.json';
const LOCAL_MOCKUP_WORKER_STATE_FILE = 'local-mockup-worker-state.json';
const WINDOWS_APP_USER_MODEL_ID = 'com.offorest.desktop';
const GEMINI_APP_URL = 'https://gemini.google.com/app';
const GEMINI_CHAT_SESSION_FILE = 'gemini-chat-session.json';
const GEMINI_CHROME_DEBUG_PORT = Number(process.env.OFFOREST_GEMINI_DEBUG_PORT || 9223);
const GEMINI_CHROME_PROFILE_DIRNAME = 'gemini-chrome-profile';
const OFFOREST_REPLACED_DESIGN_LAYER = Symbol('offorestReplacedDesignLayer');
const IS_LOCAL_MOCKUP_WORKER_PROCESS = process.argv.includes('--local-mockup-worker');
// The UI and background worker are separate Electron processes and must not
// share the UI single-instance lock. The worker is started by the UI through
// the persisted worker state, so taking this lock would make it exit whenever
// the UI is already open.
const HAS_LOCAL_MOCKUP_WORKER_LOCK = true;
const MAX_REMOTE_MASTER_IMAGE_BYTES = 50 * 1024 * 1024;

let geminiAppWindow = null;
let geminiChromeProcess = null;
let geminiChromeExecutablePath = '';
let geminiRedesignQueue = Promise.resolve();
let geminiLastOutputHash = '';
let localMockupWorkerTimer = null;
let localMockupWorkerActiveCount = 0;
let localMockupWorkerLastResult = null;

function getLocalMockupWorkerConfigPath() {
  return path.join(app.getPath('userData'), LOCAL_MOCKUP_WORKER_CONFIG_FILE);
}

function getLocalMockupWorkerStatePath() {
  return path.join(app.getPath('userData'), LOCAL_MOCKUP_WORKER_STATE_FILE);
}

async function writeLocalMockupWorkerState() {
  if (!IS_LOCAL_MOCKUP_WORKER_PROCESS) return;
  const state = {
    pid: process.pid,
    activeWorkers: localMockupWorkerActiveCount,
    lastResult: localMockupWorkerLastResult,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(getLocalMockupWorkerStatePath(), JSON.stringify(state), 'utf8');
}

async function readLocalMockupWorkerState() {
  try {
    const state = JSON.parse(await fs.readFile(getLocalMockupWorkerStatePath(), 'utf8'));
    const updatedAtMs = Date.parse(state?.updatedAt || '');
    return {
      ...state,
      running: Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < 10_000,
    };
  } catch {
    return { running: false, activeWorkers: 0, lastResult: null };
  }
}

async function ensureBackgroundLocalMockupWorker() {
  const currentState = await readLocalMockupWorkerState();
  if (currentState.running) return currentState;

  const workerArgs = app.isPackaged
    ? ['--local-mockup-worker']
    : [__dirname, '--local-mockup-worker'];
  const child = spawn(process.execPath, workerArgs, {
    cwd: __dirname,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return { running: false, starting: true, activeWorkers: 0, lastResult: null };
}

function getDefaultLocalMockupWorkerConfig() {
  return {
    host: process.env.OFFOREST_LOCAL_MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.OFFOREST_LOCAL_MYSQL_PORT || 3306),
    user: process.env.OFFOREST_LOCAL_MYSQL_USER || 'root',
    password: process.env.OFFOREST_LOCAL_MYSQL_PASSWORD || '',
    database: process.env.OFFOREST_LOCAL_MYSQL_DATABASE || 'xlap.tech',
    storageRoot: process.env.OFFOREST_LOCAL_STORAGE_ROOT || '',
    outputDir: process.env.OFFOREST_LOCAL_OUTPUT_DIR || path.join(app.getPath('userData'), 'local-mockup-output'),
    pollIntervalMs: Math.max(500, Number(process.env.OFFOREST_LOCAL_MOCKUP_POLL_MS || 2000)),
    concurrency: Math.max(1, Math.min(5, Number(process.env.OFFOREST_LOCAL_MOCKUP_CONCURRENCY || 1) || 1)),
  };
}

async function resolveXlapPublicStorageRoot(projectPath) {
  const normalizedProjectPath = path.resolve(String(projectPath || '').trim());
  if (!normalizedProjectPath) throw new Error('Thiếu đường dẫn project XLAP.');
  const projectEnvPath = path.join(normalizedProjectPath, '.env');
  let projectEnv = {};
  try {
    projectEnv = dotenv.parse(await fs.readFile(projectEnvPath, 'utf8'));
  } catch {
    // Fall back to Laravel's default public disk when the project env is unavailable.
  }
  const configuredRoot = String(projectEnv.XLAP_PUBLIC_STORAGE_PATH || '').trim();
  const storageRoot = configuredRoot
    ? (path.isAbsolute(configuredRoot) ? configuredRoot : path.resolve(normalizedProjectPath, configuredRoot))
    : path.join(normalizedProjectPath, 'storage', 'app', 'public');
  await fs.access(storageRoot);
  return storageRoot;
}

async function getLocalMockupWorkerConfig() {
  // Reload local settings so a running background worker picks up UI changes.
  dotenv.config({ path: path.join(__dirname, '.env'), override: true, quiet: true });
  const defaults = getDefaultLocalMockupWorkerConfig();
  const usesEnvConfig = [
    'OFFOREST_LOCAL_MYSQL_HOST',
    'OFFOREST_LOCAL_MYSQL_PORT',
    'OFFOREST_LOCAL_MYSQL_USER',
    'OFFOREST_LOCAL_MYSQL_PASSWORD',
    'OFFOREST_LOCAL_MYSQL_DATABASE',
    'OFFOREST_LOCAL_STORAGE_ROOT',
    'OFFOREST_LOCAL_OUTPUT_DIR',
    'OFFOREST_LOCAL_MOCKUP_POLL_MS',
    'OFFOREST_LOCAL_MOCKUP_CONCURRENCY',
  ].some((key) => Object.hasOwn(process.env, key));
  if (usesEnvConfig) return { ...defaults, source: 'env' };

  try {
    const saved = JSON.parse(await fs.readFile(getLocalMockupWorkerConfigPath(), 'utf8'));
    return { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}), source: 'app' };
  } catch {
    return { ...defaults, source: 'default' };
  }
}

function formatEnvValue(value) {
  const normalized = String(value ?? '');
  return /[\s#'"]/.test(normalized) ? `"${normalized.replace(/"/g, '\\"')}"` : normalized;
}

async function writeLocalMockupWorkerEnv(config) {
  const envPath = path.join(__dirname, '.env');
  const values = {
    OFFOREST_LOCAL_MYSQL_HOST: config.host,
    OFFOREST_LOCAL_MYSQL_PORT: config.port,
    OFFOREST_LOCAL_MYSQL_USER: config.user,
    OFFOREST_LOCAL_MYSQL_PASSWORD: config.password,
    OFFOREST_LOCAL_MYSQL_DATABASE: config.database,
    OFFOREST_LOCAL_STORAGE_ROOT: config.storageRoot,
    OFFOREST_LOCAL_OUTPUT_DIR: config.outputDir,
    OFFOREST_LOCAL_MOCKUP_POLL_MS: config.pollIntervalMs,
    OFFOREST_LOCAL_MOCKUP_CONCURRENCY: config.concurrency,
  };
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch {
    // Create the local env file when it does not exist yet.
  }

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${formatEnvValue(value)}`;
    const matcher = new RegExp(`^${key}=.*$`, 'm');
    content = matcher.test(content) ? content.replace(matcher, line) : `${content}${content.endsWith('\n') || !content ? '' : '\n'}${line}\n`;
    process.env[key] = String(value);
  }

  await fs.writeFile(envPath, content, 'utf8');
}

async function saveLocalMockupWorkerConfig(payload) {
  const current = await getLocalMockupWorkerConfig();
  const next = {
    ...current,
    host: String(payload?.host || current.host).trim(),
    port: Math.max(1, Math.min(65535, Number(payload?.port || current.port) || current.port)),
    user: String(payload?.user || current.user).trim(),
    password: payload?.password === '***' ? current.password : String(payload?.password ?? current.password),
    database: String(payload?.database || current.database).trim(),
    storageRoot: String(payload?.storageRoot || '').trim(),
    outputDir: String(payload?.outputDir || current.outputDir).trim(),
    pollIntervalMs: Math.max(500, Number(payload?.pollIntervalMs || current.pollIntervalMs) || 2000),
    concurrency: Math.max(1, Math.min(5, Number(payload?.concurrency || current.concurrency) || 1)),
  };

  if (!next.host || !next.user || !next.database || !next.outputDir) {
    throw new Error('Thiếu cấu hình MySQL hoặc thư mục output.');
  }

  await writeLocalMockupWorkerEnv(next);
  await fs.writeFile(getLocalMockupWorkerConfigPath(), JSON.stringify(next, null, 2), 'utf8');
  return { ...next, source: 'env', password: next.password ? '***' : '' };
}

function toSafeStoragePath(storageRoot, sourcePath) {
  const rawPath = String(sourcePath || '').trim();
  if (!rawPath) throw new Error('Thiếu đường dẫn master hoặc PSD trong job.');
  if (rawPath.startsWith('file://')) return fileURLToPath(rawPath);

  const normalizedSourcePath = rawPath.replace(/\\/g, '/');
  const publicStorageMarker = '/storage/app/public/';
  const publicStorageIndex = normalizedSourcePath.toLowerCase().indexOf(publicStorageMarker);
  const isStorageRelativePath = /^\/?storage\//i.test(normalizedSourcePath);
  if (path.isAbsolute(rawPath) && publicStorageIndex === -1 && !isStorageRelativePath) return path.normalize(rawPath);
  if (!storageRoot) throw new Error('Chưa cấu hình Storage root local.');

  const relativePath = publicStorageIndex >= 0
    ? normalizedSourcePath.slice(publicStorageIndex + publicStorageMarker.length)
    : normalizedSourcePath.replace(/^\/+/, '').replace(/^storage\/+/, '');
  const normalizedRelativePath = path.posix.normalize(relativePath).replace(/^\/+/, '');
  if (!normalizedRelativePath || normalizedRelativePath === '..' || normalizedRelativePath.startsWith('../')) {
    throw new Error('Đường dẫn job không hợp lệ.');
  }

  const resolvedPath = path.resolve(storageRoot, ...normalizedRelativePath.split('/'));
  const normalizedRoot = `${path.resolve(storageRoot)}${path.sep}`;
  if (!resolvedPath.startsWith(normalizedRoot)) throw new Error('Đường dẫn job không hợp lệ.');
  return resolvedPath;
}

async function resolveLocalMockupTemplatePath(storageRoot, templateStoragePath) {
  const directPath = toSafeStoragePath(storageRoot, templateStoragePath);
  try {
    await fs.access(directPath);
    return directPath;
  } catch (directError) {
    // Older template rows can retain an absolute path from a previous storage root.
    const normalizedTemplatePath = String(templateStoragePath || '').replace(/\\/g, '/');
    const relativeMatch = normalizedTemplatePath.match(/(?:^|\/)psd-mockups\/(.+)$/i);
    if (!relativeMatch || !storageRoot) throw directError;

    const remappedPath = toSafeStoragePath(storageRoot, `psd-mockups/${relativeMatch[1]}`);
    try {
      await fs.access(remappedPath);
      console.warn('[LocalMockupWorker] Remapped stale PSD template path', {
        templateStoragePath,
        remappedPath,
      });
      return remappedPath;
    } catch {
      throw new Error(`Không tìm thấy file PSD template. Đã thử: ${directPath}; ${remappedPath}`);
    }
  }
}

function imageFileToDataUrl(filePath) {
  return fs.readFile(filePath).then((buffer) => {
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  });
}

function getGoogleDriveDownloadUrl(sourceUrl) {
  const driveFileId = String(sourceUrl).match(/(?:\/d\/|[?&]id=)([-\w]{10,})/i)?.[1];
  if (!driveFileId) return sourceUrl;
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveFileId)}&export=download&confirm=t`;
}

function getImageMimeType(buffer, contentType) {
  const normalizedContentType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (['image/png', 'image/jpeg', 'image/webp'].includes(normalizedContentType)) return normalizedContentType;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

async function remoteImageUrlToDataUrl(sourceUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error('Link ảnh nguồn không hợp lệ.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Link ảnh nguồn phải dùng HTTP hoặc HTTPS.');
  }

  const downloadUrl = /(^|\.)drive\.google\.com$/i.test(parsedUrl.hostname)
    ? getGoogleDriveDownloadUrl(sourceUrl)
    : sourceUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(downloadUrl, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`Không thể tải ảnh nguồn (HTTP ${response.status}).`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_REMOTE_MASTER_IMAGE_BYTES) {
      throw new Error('Ảnh nguồn vượt quá giới hạn 50 MB.');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_REMOTE_MASTER_IMAGE_BYTES) {
      throw new Error('Ảnh nguồn trống hoặc vượt quá giới hạn 50 MB.');
    }
    const mimeType = getImageMimeType(buffer, response.headers.get('content-type'));
    if (!mimeType) {
      throw new Error('Link nguồn không trả về ảnh PNG, JPG hoặc WEBP. Với Google Drive, hãy đặt quyền Anyone with the link.');
    }
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } finally {
    clearTimeout(timeout);
  }
}

async function getMasterImageDataUrl(config, source) {
  const sourceValue = String(source || '').trim();
  if (!sourceValue) throw new Error('Thiếu ảnh master trong job.');
  if (/^https?:\/\//i.test(sourceValue)) return remoteImageUrlToDataUrl(sourceValue);
  return imageFileToDataUrl(toSafeStoragePath(config.storageRoot, sourceValue));
}

async function readLocalMockupOutputDataUrl(outputUrl) {
  const normalizedUrl = String(outputUrl || '').trim();
  if (!normalizedUrl.startsWith('/storage/')) {
    throw new Error('Đường dẫn output mockup không hợp lệ.');
  }
  const config = await getLocalMockupWorkerConfig();
  const filePath = toSafeStoragePath(config.storageRoot, normalizedUrl);
  return imageFileToDataUrl(filePath);
}

function getSafeMockupOutputFileName(name, index) {
  const fallbackName = `MOCKUP ${index + 1}.png`;
  const baseName = path.basename(String(name || fallbackName)).trim() || fallbackName;
  const sanitizedName = baseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return sanitizedName.toLowerCase().endsWith('.png') ? sanitizedName : `${sanitizedName}.png`;
}

async function claimLocalMockupJob(connection) {
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query(`
      SELECT j.*, a.user_id AS asset_user_id, a.product_id AS asset_product_id, a.redesign AS asset_redesign,
        p.slug AS verified_product_slug, t.user_id AS template_user_id, t.product_id AS template_product_id,
        t.storage_path AS template_storage_path
      FROM psd_local_mockup_jobs j
      INNER JOIN product_design_assets a ON a.id = j.product_design_asset_id
      INNER JOIN products p ON p.id = j.product_id
      INNER JOIN psd_mockup_templates t ON t.id = j.psd_mockup_template_id
      WHERE j.status = 'waiting' AND p.slug = j.product_slug
        AND a.product_id = j.product_id AND a.user_id = t.user_id AND a.product_id = t.product_id
        AND a.is_approved = 0 AND a.redesign IS NOT NULL AND a.redesign <> ''
      ORDER BY j.id ASC LIMIT 1
    `);
    const job = rows[0];
    if (!job) {
      await connection.commit();
      return null;
    }
    const [claimResult] = await connection.query(
      "UPDATE psd_local_mockup_jobs SET status = 'processing', executed_by = 'local', attempts = attempts + 1, claimed_at = NOW(), error_message = NULL WHERE id = ? AND status = 'waiting'",
      [job.id]
    );
    if (!claimResult.affectedRows) {
      await connection.commit();
      return null;
    }
    await connection.commit();
    return job;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function processLocalMockupJob(config, job) {
  const masterSource = job.master_image_uri || job.asset_redesign;
  const psdPath = await resolveLocalMockupTemplatePath(config.storageRoot, job.template_storage_path);
  const productSlug = String(job.product_slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(productSlug)) throw new Error('Product slug trong job không hợp lệ.');
  const outputRelativeDir = path.posix.join('generated', productSlug, 'mockups', String(job.product_design_asset_id));
  const jobOutputDir = path.join(config.storageRoot, ...outputRelativeDir.split('/'));
  await Promise.all([fs.access(psdPath), fs.mkdir(jobOutputDir, { recursive: true })]);
  const rendered = await renderLocalMockupWithFallbacks({
    psdPath,
    designDataUrl: await getMasterImageDataUrl(config, masterSource),
  });
  const outputUrls = [];
  for (let index = 0; index < Math.min(rendered.outputs.length, 11); index += 1) {
    const output = rendered.outputs[index];
    const fileName = getSafeMockupOutputFileName(output.name, index);
    const outputPath = path.join(jobOutputDir, fileName);
    const base64 = String(output.dataUrl).split(',')[1];
    if (!base64) throw new Error('Renderer không trả dữ liệu ảnh hợp lệ.');
    await fs.writeFile(outputPath, Buffer.from(base64, 'base64'));
    outputUrls.push(`/storage/${outputRelativeDir}/${fileName}`);
  }
  if (!outputUrls.length) throw new Error('PSD không tạo ảnh mockup nào.');
  return outputUrls;
}

async function runLocalMockupWorkerOnce() {
  localMockupWorkerActiveCount += 1;
  void writeLocalMockupWorkerState();
  let connection;
  try {
    const config = await getLocalMockupWorkerConfig();
    connection = await mysql.createConnection({
      host: config.host, port: config.port, user: config.user, password: config.password, database: config.database, connectTimeout: 10_000,
    });
    const job = await claimLocalMockupJob(connection);
    if (!job) return null;
    try {
      const outputUrls = await processLocalMockupJob(config, job);
      const assetUpdates = Array.from({ length: 11 }, (_, index) => outputUrls[index] || null);
      const columns = assetUpdates.map((_, index) => `mockup${index + 1} = ?`).join(', ');
      await connection.query(`UPDATE product_design_assets SET ${columns} WHERE id = ?`, [...assetUpdates, job.product_design_asset_id]);
      await connection.query("UPDATE psd_local_mockup_jobs SET status = 'completed', output_urls = ?, completed_at = NOW(), error_message = NULL WHERE id = ?", [JSON.stringify(outputUrls), job.id]);
      localMockupWorkerLastResult = { status: 'completed', jobId: job.id, outputCount: outputUrls.length, at: new Date().toISOString() };
      return localMockupWorkerLastResult;
    } catch (error) {
      await connection.query("UPDATE psd_local_mockup_jobs SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?", [String(error?.message || 'Local render failed').slice(0, 60000), job.id]);
      localMockupWorkerLastResult = { status: 'failed', jobId: job.id, error: String(error?.message || 'Local render failed'), at: new Date().toISOString() };
      return localMockupWorkerLastResult;
    }
  } finally {
    if (connection) await connection.end();
    localMockupWorkerActiveCount -= 1;
    void writeLocalMockupWorkerState();
  }
}

async function fillLocalMockupWorkerSlots() {
  if (!localMockupWorkerTimer) return;

  try {
    const config = await getLocalMockupWorkerConfig();
    const availableSlots = Math.max(0, config.concurrency - localMockupWorkerActiveCount);

    for (let index = 0; index < availableSlots; index += 1) {
      void runLocalMockupWorkerOnce()
        .then((result) => {
          if (result) void fillLocalMockupWorkerSlots();
        })
        .catch((error) => {
          localMockupWorkerLastResult = { status: 'error', error: error.message, at: new Date().toISOString() };
        });
    }
  } catch (error) {
    localMockupWorkerLastResult = { status: 'error', error: error.message, at: new Date().toISOString() };
  }
}

async function startLocalMockupWorker() {
  const config = await getLocalMockupWorkerConfig();
  if (!localMockupWorkerTimer) {
    localMockupWorkerTimer = setInterval(() => {
      void fillLocalMockupWorkerSlots();
    }, config.pollIntervalMs);
  }
  // Always kick the queue so a new waiting job never needs a manual restart.
  void fillLocalMockupWorkerSlots();
  return getLocalMockupWorkerStatus();
}

function stopLocalMockupWorker() {
  if (localMockupWorkerTimer) clearInterval(localMockupWorkerTimer);
  localMockupWorkerTimer = null;
  return getLocalMockupWorkerStatus();
}

async function getLocalMockupWorkerStatus() {
  if (localMockupWorkerTimer) {
    // Status polling doubles as a recovery trigger if an idle worker missed a timer tick.
    void fillLocalMockupWorkerSlots();
  }

  const status = {
    running: Boolean(localMockupWorkerTimer),
    processing: localMockupWorkerActiveCount > 0,
    activeWorkers: localMockupWorkerActiveCount,
    lastResult: localMockupWorkerLastResult,
    summary: { waiting: 0, processing: 0, completed: 0, failed: 0 },
    jobs: [],
  };
  if (!IS_LOCAL_MOCKUP_WORKER_PROCESS) {
    const backgroundState = await readLocalMockupWorkerState();
    status.running = backgroundState.running;
    status.processing = Number(backgroundState.activeWorkers || 0) > 0;
    status.activeWorkers = Number(backgroundState.activeWorkers || 0);
    status.lastResult = backgroundState.lastResult;
  }
  let connection;
  try {
    const config = await getLocalMockupWorkerConfig();
    connection = await mysql.createConnection({
      host: config.host, port: config.port, user: config.user, password: config.password, database: config.database, connectTimeout: 10_000,
    });
    const [summaryRows] = await connection.query(`
      SELECT status, COUNT(*) AS total
      FROM psd_local_mockup_jobs
      GROUP BY status
    `);
    summaryRows.forEach((row) => {
      if (Object.hasOwn(status.summary, row.status)) status.summary[row.status] = Number(row.total) || 0;
    });
    const [jobs] = await connection.query(`
      SELECT j.id, j.job_uuid, j.product_design_asset_id, j.status, j.attempts, j.output_urls, j.error_message,
        j.claimed_at, j.completed_at, j.created_at, a.user_id, a.item_number, p.slug AS product_slug
      FROM psd_local_mockup_jobs j
      LEFT JOIN product_design_assets a ON a.id = j.product_design_asset_id
      LEFT JOIN products p ON p.id = j.product_id
      ORDER BY j.id DESC
      LIMIT 20
    `);
    status.jobs = jobs.map((job) => {
      let outputUrls = [];
      try {
        outputUrls = typeof job.output_urls === 'string' ? JSON.parse(job.output_urls) : job.output_urls;
      } catch {
        outputUrls = [];
      }
      const localOutputUrls = Array.isArray(outputUrls)
        ? outputUrls.map((url) => {
          const normalizedUrl = String(url || '');
          if (!normalizedUrl.startsWith('/storage/')) return normalizedUrl;
          return pathToFileURL(path.join(config.storageRoot, normalizedUrl.slice('/storage/'.length))).href;
        })
        : [];
      return { ...job, local_output_urls: localOutputUrls };
    });
  } catch (error) {
    status.error = String(error?.message || 'Không thể đọc trạng thái job local.');
  } finally {
    if (connection) await connection.end();
  }
  return status;
}

function enqueueGeminiRedesignTask(taskFn) {
  const run = geminiRedesignQueue.then(() => taskFn());
  geminiRedesignQueue = run.catch(() => {});
  return run;
}

function getRendererLogFilePath() {
  return path.join(app.getPath('userData'), 'log.txt');
}

async function ensureRendererLogFile() {
  const logFilePath = getRendererLogFilePath();
  await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  try {
    await fs.access(logFilePath);
  } catch {
    await fs.writeFile(logFilePath, '', 'utf8');
  }
  return logFilePath;
}

function safeCreateCanvas(width, height) {
  return createCanvas(toPositiveInt(width, 1), toPositiveInt(height, 1));
}

function SafeImageData(dataOrWidth, width, height) {
  if (!(this instanceof SafeImageData)) {
    return new SafeImageData(dataOrWidth, width, height);
  }

  if (typeof dataOrWidth === 'number') {
    const safeWidth = toPositiveInt(dataOrWidth, 1);
    const safeHeight = toPositiveInt(width, 1);
    this.width = safeWidth;
    this.height = safeHeight;
    this.data = new Uint8ClampedArray(safeWidth * safeHeight * 4);
    return;
  }

  const srcData = dataOrWidth instanceof Uint8ClampedArray
    ? dataOrWidth
    : new Uint8ClampedArray(dataOrWidth || 0);
  const safeWidth = toPositiveInt(width, 1);
  const inferredHeight = Math.max(1, Math.trunc(srcData.length / (safeWidth * 4)) || 1);
  const safeHeight = toPositiveInt(height, inferredHeight);
  const neededLength = safeWidth * safeHeight * 4;
  const normalizedData = new Uint8ClampedArray(neededLength);
  normalizedData.set(srcData.subarray(0, neededLength));

  this.width = safeWidth;
  this.height = safeHeight;
  this.data = normalizedData;
}

initializeCanvas(safeCreateCanvas, loadImage, SafeImageData);

function toSafeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function toPositiveInt(value, fallback = 1) {
  return Math.max(1, toSafeInt(value, fallback));
}

function getLayerBounds(layer) {
  const left = toSafeInt(layer?.left, 0);
  const top = toSafeInt(layer?.top, 0);
  const right = toSafeInt(layer?.right, left);
  const bottom = toSafeInt(layer?.bottom, top);
  const width = toPositiveInt(right - left, 1);
  const height = toPositiveInt(bottom - top, 1);
  return { left, top, right, bottom, width, height };
}

function walkLayers(layers, visitor, parent = null) {
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    visitor(layer, parent);
    if (Array.isArray(layer?.children) && layer.children.length) {
      walkLayers(layer.children, visitor, layer);
    }
  }
}

function isMockupGroup(layer) {
  return Array.isArray(layer?.children) && /^\s*mockup\s+\d+\s*$/i.test(String(layer?.name || '').trim());
}

function getMockupGroupOrder(layer) {
  const name = String(layer?.name || '').trim();
  const match = name.match(/^\s*mockup\s+(\d+)\s*$/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function collectMockupGroups(psd) {
  const groups = [];
  walkLayers(psd?.children || [], (layer) => {
    if (isMockupGroup(layer)) {
      groups.push(layer);
    }
  });
  return groups.sort((a, b) => {
    const orderA = getMockupGroupOrder(a);
    const orderB = getMockupGroupOrder(b);
    if (orderA !== orderB) return orderA - orderB;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

function setMockupVisibility(psd, activeGroup) {
  const previous = new Map();
  walkLayers(psd?.children || [], (layer) => {
    if (isMockupGroup(layer)) {
      previous.set(layer, layer.visible);
      layer.visible = layer === activeGroup;
    }
  });
  return () => {
    for (const [layer, visible] of previous.entries()) {
      layer.visible = visible;
    }
  };
}

function isLayerVisible(layer) {
  return layer?.visible !== false && layer?.hidden !== true;
}

function mapBlendModeToCanvas(mode) {
  const normalized = String(mode || 'normal').trim().toLowerCase();
  switch (normalized) {
    case 'normal':
    case 'pass through':
    case 'passthrough':
      return 'source-over';
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'darken':
      return 'darken';
    case 'lighten':
      return 'lighten';
    case 'color burn':
    case 'colorburn':
      return 'color-burn';
    case 'color dodge':
    case 'colordodge':
      return 'color-dodge';
    case 'hard light':
    case 'hardlight':
      return 'hard-light';
    case 'soft light':
    case 'softlight':
      return 'soft-light';
    case 'difference':
      return 'difference';
    case 'exclusion':
      return 'exclusion';
    case 'hue':
      return 'hue';
    case 'saturation':
      return 'saturation';
    case 'color':
      return 'color';
    case 'luminosity':
      return 'luminosity';
    case 'linear dodge':
    case 'lineardodge':
    case 'add':
      return 'lighter';
    case 'linear burn':
    case 'linearburn':
      return 'multiply';
    default:
      return 'source-over';
  }
}

function colorToRgbaString(color, opacity = 1) {
  if (!color) return `rgba(0, 0, 0, ${Math.max(0, Math.min(1, opacity))})`;

  const red = Number(color.r ?? color.red ?? 0);
  const green = Number(color.g ?? color.green ?? 0);
  const blue = Number(color.b ?? color.blue ?? 0);
  const alpha = Math.max(0, Math.min(1, opacity));
  return `rgba(${Math.max(0, Math.min(255, red))}, ${Math.max(0, Math.min(255, green))}, ${Math.max(0, Math.min(255, blue))}, ${alpha})`;
}

function getPixelsFromUnitsValue(value, fallback = 0) {
  if (value && typeof value === 'object' && 'value' in value) {
    return Math.max(0, Number(value.value) || fallback);
  }

  return Math.max(0, Number(value) || fallback);
}

function getNormalizedAngleRadians(angle = 0) {
  return (Number(angle) || 0) * (Math.PI / 180);
}

function getShadowOffset(effect = {}) {
  const distance = getPixelsFromUnitsValue(effect?.distance, 0);
  const angle = getNormalizedAngleRadians(effect?.angle ?? 0);
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  };
}

function createEffectCanvas(width, height) {
  return createCanvas(width, height);
}

function renderGlowOrShadow(sourceCanvas, effect, { inside = false } = {}) {
  const width = toPositiveInt(sourceCanvas?.width, 1);
  const height = toPositiveInt(sourceCanvas?.height, 1);
  const effectCanvas = createEffectCanvas(width, height);
  const effectContext = effectCanvas.getContext('2d');
  const blurRadius = getPixelsFromUnitsValue(effect?.size, 0);
  const opacity = normalizeEffectOpacity(effect?.opacity ?? 1);
  const offset = getShadowOffset(effect);

  effectContext.clearRect(0, 0, width, height);
  effectContext.save();
  effectContext.shadowColor = colorToRgbaString(effect?.color, opacity);
  effectContext.shadowBlur = blurRadius;
  effectContext.shadowOffsetX = offset.x;
  effectContext.shadowOffsetY = offset.y;
  effectContext.drawImage(sourceCanvas, 0, 0, width, height);
  effectContext.restore();

  effectContext.save();
  effectContext.globalCompositeOperation = inside ? 'destination-in' : 'destination-out';
  effectContext.drawImage(sourceCanvas, 0, 0, width, height);
  effectContext.restore();

  return effectCanvas;
}

function renderSolidFill(sourceCanvas, effect) {
  const width = toPositiveInt(sourceCanvas?.width, 1);
  const height = toPositiveInt(sourceCanvas?.height, 1);
  const fillCanvas = createEffectCanvas(width, height);
  const fillContext = fillCanvas.getContext('2d');
  const opacity = normalizeEffectOpacity(effect?.opacity ?? 1);

  fillContext.clearRect(0, 0, width, height);
  fillContext.fillStyle = colorToRgbaString(effect?.color, opacity);
  fillContext.fillRect(0, 0, width, height);
  fillContext.globalCompositeOperation = 'destination-in';
  fillContext.drawImage(sourceCanvas, 0, 0, width, height);
  return fillCanvas;
}

function normalizeEffectOpacity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  if (parsed <= 1) return Math.max(0, Math.min(1, parsed));
  return Math.max(0, Math.min(1, parsed / 255));
}

function hasEnabledLayerEffects(layer) {
  const effects = layer?.effects;
  if (!effects || effects.disabled === true) return false;

  return Object.values(effects).some((entry) => {
    if (Array.isArray(entry)) {
      return entry.some((effect) => effect?.enabled !== false);
    }

    return entry && typeof entry === 'object' && entry.enabled !== false;
  });
}

function getFirstEnabledEffect(entry) {
  if (Array.isArray(entry)) {
    return entry.find((effect) => effect?.enabled !== false) || null;
  }

  if (entry && typeof entry === 'object' && entry.enabled !== false) {
    return entry;
  }

  return null;
}

function shouldApplyLayerEffects(layer) {
  const customEffectPassEnabled = String(process.env.OFFOREST_ENABLE_CUSTOM_EFFECTS || '').toLowerCase() === 'true';
  return customEffectPassEnabled || layer?.[OFFOREST_REPLACED_DESIGN_LAYER] === true;
}

function applyLayerEffects(layer, sourceCanvas) {
  if (!layer?.effects || !hasEnabledLayerEffects(layer)) {
    return sourceCanvas;
  }

  const width = toPositiveInt(sourceCanvas?.width, 1);
  const height = toPositiveInt(sourceCanvas?.height, 1);
  const outputCanvas = createEffectCanvas(width, height);
  const outputContext = outputCanvas.getContext('2d');
  const effects = layer.effects;

  const dropShadow = getFirstEnabledEffect(effects.dropShadow);
  const innerShadow = getFirstEnabledEffect(effects.innerShadow);
  const outerGlow = getFirstEnabledEffect(effects.outerGlow);
  const innerGlow = getFirstEnabledEffect(effects.innerGlow);
  const bevel = getFirstEnabledEffect(effects.bevel);
  const solidFill = getFirstEnabledEffect(effects.solidFill);

  if (dropShadow) {
    const shadowCanvas = renderGlowOrShadow(sourceCanvas, dropShadow, { inside: false });
    outputContext.drawImage(shadowCanvas, 0, 0, width, height);
  }

  if (outerGlow) {
    const glowCanvas = renderGlowOrShadow(sourceCanvas, outerGlow, { inside: false });
    outputContext.save();
    outputContext.globalCompositeOperation = mapBlendModeToCanvas(outerGlow.blendMode);
    outputContext.drawImage(glowCanvas, 0, 0, width, height);
    outputContext.restore();
  }

  outputContext.drawImage(sourceCanvas, 0, 0, width, height);

  if (solidFill) {
    const fillCanvas = renderSolidFill(sourceCanvas, solidFill);
    outputContext.save();
    outputContext.globalCompositeOperation = mapBlendModeToCanvas(solidFill.blendMode);
    outputContext.drawImage(fillCanvas, 0, 0, width, height);
    outputContext.restore();
  }

  if (innerShadow) {
    const shadowCanvas = renderGlowOrShadow(sourceCanvas, innerShadow, { inside: true });
    outputContext.save();
    outputContext.globalCompositeOperation = mapBlendModeToCanvas(innerShadow.blendMode);
    outputContext.drawImage(shadowCanvas, 0, 0, width, height);
    outputContext.restore();
  }

  if (innerGlow) {
    const glowCanvas = renderGlowOrShadow(sourceCanvas, innerGlow, { inside: true });
    outputContext.save();
    outputContext.globalCompositeOperation = mapBlendModeToCanvas(innerGlow.blendMode);
    outputContext.drawImage(glowCanvas, 0, 0, width, height);
    outputContext.restore();
  }

  if (bevel) {
    const bevelStrength = Math.max(0.1, Number(bevel.strength) || 0.5);
    const bevelSize = Math.max(0, getPixelsFromUnitsValue(bevel.size, 0));
    const highlightCanvas = renderGlowOrShadow(sourceCanvas, {
      size: { value: bevelSize || 1 },
      angle: (Number(bevel.angle) || 0) - 135,
      distance: { value: bevelSize || 1 },
      color: bevel.highlightColor,
      opacity: (Number(bevel.highlightOpacity) || 0.5) * bevelStrength,
      blendMode: bevel.highlightBlendMode,
    }, { inside: true });
    const shadowCanvas = renderGlowOrShadow(sourceCanvas, {
      size: { value: bevelSize || 1 },
      angle: (Number(bevel.angle) || 0) + 45,
      distance: { value: bevelSize || 1 },
      color: bevel.shadowColor,
      opacity: (Number(bevel.shadowOpacity) || 0.5) * bevelStrength,
      blendMode: bevel.shadowBlendMode,
    }, { inside: true });

    outputContext.save();
    outputContext.globalCompositeOperation = mapBlendModeToCanvas(bevel.highlightBlendMode);
    outputContext.drawImage(highlightCanvas, 0, 0, width, height);
    outputContext.restore();

    outputContext.save();
    outputContext.globalCompositeOperation = mapBlendModeToCanvas(bevel.shadowBlendMode);
    outputContext.drawImage(shadowCanvas, 0, 0, width, height);
    outputContext.restore();
  }

  return outputCanvas;
}

function isDesignTargetLayer(layer) {
  if (!layer || Array.isArray(layer?.children)) return false;

  const normalizedName = String(layer?.name || '').trim().toLowerCase();

  // Support both spellings used in this PSD: "Design" and "Desgin".
  return normalizedName === 'design' || normalizedName === 'desgin';
}

function findTemplateLayerOutsideMockupGroups(psd) {
  let templateLayer = null;
  const visit = (layers, insideMockupGroup = false) => {
    for (const layer of layers || []) {
      const isMockup = isMockupGroup(layer);
      const nextInsideMockup = insideMockupGroup || isMockup;
      if (!nextInsideMockup && String(layer?.name || '').trim().toLowerCase() === 'template') {
        templateLayer = layer;
        return true;
      }
      if (Array.isArray(layer?.children) && visit(layer.children, nextInsideMockup)) return true;
    }
    return false;
  };
  visit(psd?.children || []);
  return templateLayer;
}

async function replaceDesignLayers(psd, designDataUrl) {
  const designLayers = [];
  walkLayers(psd?.children || [], (layer) => {
    if (isDesignTargetLayer(layer)) {
      designLayers.push(layer);
    }
  });

  if (!designLayers.length) {
    throw new Error('Không tìm thấy layer tên "Design" trong file PSD.');
  }

  const image = await loadImage(designDataUrl);
  const templateLayer = findTemplateLayerOutsideMockupGroups(psd);
  const templateBounds = templateLayer ? getLayerBounds(templateLayer) : null;

  for (const designLayer of designLayers) {
    const bounds = getLayerBounds(designLayer);
    const targetBounds = templateBounds || bounds;
    const targetWidth = toPositiveInt(targetBounds.width, 1);
    const targetHeight = toPositiveInt(targetBounds.height, 1);
    const layerCanvas = createCanvas(targetWidth, targetHeight);
    const ctx = layerCanvas.getContext('2d');
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    designLayer.canvas = layerCanvas;
    if (templateBounds) {
      designLayer.left = templateBounds.left;
      designLayer.top = templateBounds.top;
      designLayer.right = templateBounds.right;
      designLayer.bottom = templateBounds.bottom;
    }
    designLayer[OFFOREST_REPLACED_DESIGN_LAYER] = true;
  }

  return designLayers.length;
}

function drawPsdToCanvas(psd, layersToDraw = null) {
  const width = toPositiveInt(psd?.width, 1);
  const height = toPositiveInt(psd?.height, 1);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  const toCanvasFromImageData = (imageDataLike) => {
    if (!imageDataLike || !imageDataLike.data || !imageDataLike.width || !imageDataLike.height) {
      return null;
    }

    const imageWidth = toPositiveInt(imageDataLike.width, 0);
    const imageHeight = toPositiveInt(imageDataLike.height, 0);
    if (!imageWidth || !imageHeight) {
      return null;
    }

    const srcPixels = imageDataLike.data instanceof Uint8ClampedArray
      ? imageDataLike.data
      : new Uint8ClampedArray(imageDataLike.data);

    const layerCanvas = createCanvas(
      toPositiveInt(imageWidth, imageWidth),
      toPositiveInt(imageHeight, imageHeight)
    );
    const layerContext = layerCanvas.getContext('2d');
    const targetImageData = layerContext.createImageData(imageWidth, imageHeight);
    targetImageData.data.set(srcPixels.subarray(0, targetImageData.data.length));
    layerContext.putImageData(targetImageData, 0, 0);
    return layerCanvas;
  };

  const resolveLayerSource = (layer) => {
    if (layer?.canvas && typeof layer.canvas.getContext === 'function') {
      return layer.canvas;
    }

    if (layer?.imageData) {
      return toCanvasFromImageData(layer.imageData);
    }

    return null;
  };

  const resolveMaskSource = (mask) => {
    if (!mask) return null;

    if (mask?.canvas && typeof mask.canvas.getContext === 'function') {
      return mask.canvas;
    }

    if (mask?.imageData) {
      return toCanvasFromImageData(mask.imageData);
    }

    return null;
  };

  const normalizeOpacity = (opacityValue) => {
    const parsed = Number(opacityValue);
    if (!Number.isFinite(parsed)) return 1;
    if (parsed <= 1) return Math.max(0, Math.min(1, parsed));
    return Math.max(0, Math.min(1, parsed / 255));
  };

  const placeCanvas = (sourceCanvas, left, top) => {
    const placedCanvas = createCanvas(width, height);
    const placedContext = placedCanvas.getContext('2d');
    placedContext.drawImage(
      sourceCanvas,
      toSafeInt(left, 0),
      toSafeInt(top, 0),
      toPositiveInt(sourceCanvas?.width, 1),
      toPositiveInt(sourceCanvas?.height, 1)
    );
    return placedCanvas;
  };

  const applyMaskCanvas = (sourceCanvas, maskCanvas) => {
    if (!maskCanvas) return sourceCanvas;

    const maskedCanvas = createCanvas(width, height);
    const maskedContext = maskedCanvas.getContext('2d');
    maskedContext.drawImage(sourceCanvas, 0, 0, width, height);
    maskedContext.globalCompositeOperation = 'destination-in';
    maskedContext.drawImage(maskCanvas, 0, 0, width, height);
    return maskedCanvas;
  };

  const buildOpacityCanvas = (sourceCanvas, opacityValue) => {
    const opacityCanvas = createCanvas(width, height);
    const opacityContext = opacityCanvas.getContext('2d');
    opacityContext.save();
    opacityContext.globalAlpha = normalizeOpacity(opacityValue);
    opacityContext.drawImage(sourceCanvas, 0, 0, width, height);
    opacityContext.restore();
    return opacityCanvas;
  };

  const getPlacedLayerQuad = (layer, sourceCanvas) => {
    const placedLayer = layer?.placedLayer;
    if (!placedLayer) return null;

    const quad = Array.isArray(placedLayer?.nonAffineTransform) && placedLayer.nonAffineTransform.length === 8
      ? placedLayer.nonAffineTransform
      : (Array.isArray(placedLayer?.transform) && placedLayer.transform.length === 8
        ? placedLayer.transform
        : null);

    if (!quad) return null;

    const sourceWidth = toPositiveInt(placedLayer?.width, toPositiveInt(sourceCanvas?.width, 1));
    const sourceHeight = toPositiveInt(placedLayer?.height, toPositiveInt(sourceCanvas?.height, 1));

    return {
      sourceWidth,
      sourceHeight,
      points: [
        { x: Number(quad[0]) || 0, y: Number(quad[1]) || 0 },
        { x: Number(quad[2]) || 0, y: Number(quad[3]) || 0 },
        { x: Number(quad[4]) || 0, y: Number(quad[5]) || 0 },
        { x: Number(quad[6]) || 0, y: Number(quad[7]) || 0 },
      ],
    };
  };

  const drawPlacedLayerQuad = (targetContext, sourceCanvas, placedQuad) => {
    if (!targetContext || !sourceCanvas || !placedQuad?.points?.length) return;

    const [p0, p1, p2, p3] = placedQuad.points;
    const sourceWidth = toPositiveInt(placedQuad.sourceWidth, toPositiveInt(sourceCanvas?.width, 1));
    const sourceHeight = toPositiveInt(placedQuad.sourceHeight, toPositiveInt(sourceCanvas?.height, 1));
    const isAffineQuad = Math.hypot((p0.x + p2.x) - (p1.x + p3.x), (p0.y + p2.y) - (p1.y + p3.y)) < 0.75;

    if (isAffineQuad) {
      targetContext.save();
      targetContext.setTransform(
        (p1.x - p0.x) / sourceWidth,
        (p1.y - p0.y) / sourceWidth,
        (p3.x - p0.x) / sourceHeight,
        (p3.y - p0.y) / sourceHeight,
        p0.x,
        p0.y
      );
      targetContext.drawImage(
        sourceCanvas,
        0,
        0,
        toPositiveInt(sourceCanvas?.width, 1),
        toPositiveInt(sourceCanvas?.height, 1),
        0,
        0,
        sourceWidth,
        sourceHeight
      );
      targetContext.restore();
      return;
    }

    const expandTriangle = (points, amount = 0.75) => {
      const center = points.reduce(
        (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
        { x: 0, y: 0 }
      );

      return points.map((point) => {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const length = Math.hypot(dx, dy) || 1;
        return {
          x: point.x + (dx / length) * amount,
          y: point.y + (dy / length) * amount,
        };
      });
    };

    const drawTriangle = (trianglePoints, matrix) => {
      const expandedPoints = expandTriangle(trianglePoints);

      targetContext.save();
      targetContext.beginPath();
      targetContext.moveTo(expandedPoints[0].x, expandedPoints[0].y);
      targetContext.lineTo(expandedPoints[1].x, expandedPoints[1].y);
      targetContext.lineTo(expandedPoints[2].x, expandedPoints[2].y);
      targetContext.closePath();
      targetContext.clip();

      targetContext.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
      targetContext.drawImage(
        sourceCanvas,
        0,
        0,
        toPositiveInt(sourceCanvas?.width, 1),
        toPositiveInt(sourceCanvas?.height, 1),
        0,
        0,
        sourceWidth,
        sourceHeight
      );
      targetContext.restore();
    };

    const tri1 = [p0, p1, p2];
    drawTriangle(tri1, {
      a: (p1.x - p0.x) / sourceWidth,
      b: (p1.y - p0.y) / sourceWidth,
      c: (p2.x - p1.x) / sourceHeight,
      d: (p2.y - p1.y) / sourceHeight,
      e: p0.x,
      f: p0.y,
    });

    const tri2 = [p0, p2, p3];
    drawTriangle(tri2, {
      a: (p2.x - p3.x) / sourceWidth,
      b: (p2.y - p3.y) / sourceWidth,
      c: (p3.x - p0.x) / sourceHeight,
      d: (p3.y - p0.y) / sourceHeight,
      e: p0.x,
      f: p0.y,
    });
  };

  const renderLayerContent = (layer, parentVisible = true, inheritedOpacity = 1) => {
    const layerVisible = parentVisible && isLayerVisible(layer);
    if (!layerVisible) return null;

    if (Array.isArray(layer?.children) && layer.children.length) {
      const groupCanvas = createCanvas(width, height);
      const groupContext = groupCanvas.getContext('2d');
      drawLayerSequence(layer.children, groupContext, layerVisible, inheritedOpacity);

      const groupMask = resolveMaskSource(layer?.mask);
      if (!groupMask) {
        return groupCanvas;
      }

      const maskBounds = getLayerBounds(layer.mask);
      return applyMaskCanvas(groupCanvas, placeCanvas(groupMask, maskBounds.left, maskBounds.top));
    }

    const srcCanvas = resolveLayerSource(layer);
    if (!srcCanvas) return null;

    const bounds = getLayerBounds(layer);
    const layerCanvas = createCanvas(width, height);
    const layerContext = layerCanvas.getContext('2d');
    const placedQuad = getPlacedLayerQuad(layer, srcCanvas);
    layerContext.save();
    layerContext.globalAlpha = Math.max(0, Math.min(1, inheritedOpacity));
    if (placedQuad) {
      drawPlacedLayerQuad(layerContext, srcCanvas, placedQuad);
    } else {
      layerContext.drawImage(
        srcCanvas,
        toSafeInt(bounds.left, 0),
        toSafeInt(bounds.top, 0),
        toPositiveInt(bounds.width, 1),
        toPositiveInt(bounds.height, 1)
      );
    }
    layerContext.restore();

    // Keep original PSD pixels as-is by default; only re-apply effects for replaced design layers.
    const renderedWithEffects = shouldApplyLayerEffects(layer)
      ? applyLayerEffects(layer, layerCanvas)
      : layerCanvas;

    const layerMask = resolveMaskSource(layer?.mask);
    if (!layerMask) {
      return renderedWithEffects;
    }

    const maskBounds = getLayerBounds(layer.mask);
    return applyMaskCanvas(renderedWithEffects, placeCanvas(layerMask, maskBounds.left, maskBounds.top));
  };

  const compositeLayerCanvas = (targetContext, sourceCanvas, opacityValue, blendMode) => {
    if (!sourceCanvas) return;

    targetContext.save();
    targetContext.globalAlpha = Math.max(0, Math.min(1, normalizeOpacity(opacityValue)));
    targetContext.globalCompositeOperation = blendMode;
    targetContext.drawImage(sourceCanvas, 0, 0, width, height);
    targetContext.restore();
  };

  const drawLayerSequence = (layers, targetContext, parentVisible = true, inheritedOpacity = 1) => {
    let lastBaseCanvas = null;

    for (const layer of layers || []) {
      const layerVisible = parentVisible && isLayerVisible(layer);
      if (!layerVisible) {
        if (!layer?.clipping) {
          lastBaseCanvas = null;
        }
        continue;
      }

      const layerContent = renderLayerContent(layer, layerVisible, inheritedOpacity);
      if (!layerContent) {
        if (!layer?.clipping) {
          lastBaseCanvas = null;
        }
        continue;
      }

      const blendMode = mapBlendModeToCanvas(layer?.blendMode);
      const layerOpacity = normalizeOpacity(layer?.opacity ?? 1);
      const fillOpacity = normalizeOpacity(layer?.fillOpacity ?? 1);
      const effectiveOpacity = Math.max(0, Math.min(1, layerOpacity * fillOpacity));

      if (layer?.clipping) {
        if (!lastBaseCanvas) {
          continue;
        }

        const clippedCanvas = applyMaskCanvas(layerContent, lastBaseCanvas);
        compositeLayerCanvas(targetContext, clippedCanvas, effectiveOpacity, blendMode);
        continue;
      }

      compositeLayerCanvas(targetContext, layerContent, effectiveOpacity, blendMode);
      lastBaseCanvas = buildOpacityCanvas(layerContent, effectiveOpacity);
    }
  };

  drawLayerSequence(layersToDraw || psd?.children || [], context, true, 1);

  return canvas;
}

async function renderMockupsFromPsd({ psdPath, designDataUrl, onOutput = null, skipCollectOutputs = false }) {
  if (!psdPath) {
    throw new Error('Thiếu đường dẫn file PSD');
  }

  if (!designDataUrl || !String(designDataUrl).startsWith('data:image/')) {
    throw new Error('Thiếu ảnh redesign hợp lệ để gắn vào layer Design');
  }

  const psdBuffer = await fs.readFile(psdPath);
  const psd = readPsd(psdBuffer, {
    useImageData: true,
    useRawThumbnail: false,
    skipLayerImageData: false,
    skipCompositeImageData: false,
  });

  const replacedDesignLayerCount = await replaceDesignLayers(psd, designDataUrl);

  const mockupGroups = collectMockupGroups(psd);
  if (!mockupGroups.length) {
    throw new Error('Không tìm thấy folder MOCKUP * trong file PSD.');
  }

  const outputs = [];
  const fullLayerStack = psd?.children || [];

  for (let index = 0; index < mockupGroups.length; index += 1) {
    const group = mockupGroups[index];
    const previousHidden = group.hidden;
    const previousVisible = group.visible;
    group.hidden = false;
    group.visible = true;

    try {
      // Preserve the full PSD layer stack for each export; only ensure current MOCKUP group is visible.
      const canvas = drawPsdToCanvas(psd, fullLayerStack);
      const pngBuffer = canvas.toBuffer('image/png');
      const output = {
        name: `${String(group?.name || 'MOCKUP').trim()}.png`,
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      };

      if (!skipCollectOutputs) {
        outputs.push(output);
      }

      if (typeof onOutput === 'function') {
        await onOutput(output, index + 1, mockupGroups.length);
        // Yield between outputs so renderer can stay responsive.
        await new Promise((resolve) => setImmediate(resolve));
      }
    } catch (error) {
      const groupName = String(group?.name || 'UNKNOWN');
      throw new Error(`Render group \"${groupName}\" thất bại: ${error?.message || 'unknown error'}`);
    } finally {
      group.hidden = previousHidden;
      group.visible = previousVisible;
    }
  }

  return {
    templatePath: psdPath,
    replacedDesignLayerCount,
    count: mockupGroups.length,
    outputs,
  };
}

async function renderMockupTemplatePreviewFromPsd({ psdPath }) {
  if (!psdPath) {
    throw new Error('Thiếu đường dẫn file PSD');
  }

  const psdBuffer = await fs.readFile(psdPath);
  const psd = readPsd(psdBuffer, {
    useImageData: true,
    useRawThumbnail: false,
    skipLayerImageData: false,
    skipCompositeImageData: false,
  });

  const mockupGroups = collectMockupGroups(psd);
  if (!mockupGroups.length) {
    throw new Error('Không tìm thấy folder MOCKUP * trong file PSD.');
  }

  const outputs = [];
  const fullLayerStack = psd?.children || [];

  for (const group of mockupGroups) {
    const previousHidden = group.hidden;
    const previousVisible = group.visible;
    group.hidden = false;
    group.visible = true;

    try {
      const canvas = drawPsdToCanvas(psd, fullLayerStack);
      const pngBuffer = canvas.toBuffer('image/png');
      outputs.push({
        name: `${String(group?.name || 'MOCKUP').trim()}.png`,
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      });
    } catch (error) {
      const groupName = String(group?.name || 'UNKNOWN');
      throw new Error(`Render template group "${groupName}" thất bại: ${error?.message || 'unknown error'}`);
    } finally {
      group.hidden = previousHidden;
      group.visible = previousVisible;
    }
  }

  return {
    templatePath: psdPath,
    replacedDesignLayerCount: 0,
    count: outputs.length,
    outputs,
    warning: 'Đã xuất PNG trực tiếp từ mockup template gốc, không thay design layer.',
  };
}

async function renderPsdReplaceDesignFull({ psdPath, designDataUrl }) {
  if (!psdPath) {
    throw new Error('Thiếu đường dẫn file PSD');
  }

  if (!designDataUrl || !String(designDataUrl).startsWith('data:image/')) {
    throw new Error('Thiếu ảnh redesign hợp lệ để gắn vào layer Design');
  }

  const psdBuffer = await fs.readFile(psdPath);
  const psd = readPsd(psdBuffer, {
    useImageData: true,
    useRawThumbnail: false,
    skipLayerImageData: false,
    skipCompositeImageData: false,
  });

  const replacedDesignLayerCount = await replaceDesignLayers(psd, designDataUrl);
  const canvas = drawPsdToCanvas(psd, psd?.children || []);
  const pngBuffer = canvas.toBuffer('image/png');

  return {
    templatePath: psdPath,
    replacedDesignLayerCount,
    count: 1,
    outputs: [
      {
        name: `${path.parse(psdPath).name || 'mockup'}-full.png`,
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      },
    ],
  };
}

async function renderPsdPreviewWithDesignPatch({ psdPath, designDataUrl }) {
  if (!psdPath) {
    throw new Error('Thiếu đường dẫn file PSD');
  }

  if (!designDataUrl || !String(designDataUrl).startsWith('data:image/')) {
    throw new Error('Thiếu ảnh redesign hợp lệ để gắn vào layer Design');
  }

  const psdPreview = PSD.fromFile(psdPath);
  psdPreview.parse();

  const previewPng = psdPreview.image?.toPng?.();
  if (!previewPng || typeof previewPng.pack !== 'function') {
    throw new Error('Không đọc được flattened preview từ PSD. Hãy bật Maximize Compatibility khi lưu PSD.');
  }

  const previewBuffer = await streamToBuffer(previewPng.pack());
  const baseImage = await loadImage(previewBuffer);

  const psdBuffer = await fs.readFile(psdPath);
  const psdMeta = readPsd(psdBuffer, {
    useImageData: true,
    useRawThumbnail: false,
    skipLayerImageData: false,
    skipCompositeImageData: true,
  });

  const designLayers = [];
  walkLayers(psdMeta?.children || [], (layer) => {
    if (isDesignTargetLayer(layer)) {
      designLayers.push(layer);
    }
  });

  if (!designLayers.length) {
    throw new Error('Không tìm thấy layer tên "Design" hoặc "Desgin" trong file PSD.');
  }

  const width = toPositiveInt(psdMeta?.width || baseImage?.width, 1);
  const height = toPositiveInt(psdMeta?.height || baseImage?.height, 1);
  const outputCanvas = createCanvas(width, height);
  const outputContext = outputCanvas.getContext('2d');
  outputContext.drawImage(baseImage, 0, 0, width, height);

  const designImage = await loadImage(designDataUrl);

  const toCanvasFromImageData = (imageDataLike) => {
    if (!imageDataLike || !imageDataLike.data || !imageDataLike.width || !imageDataLike.height) {
      return null;
    }

    const imageWidth = toPositiveInt(imageDataLike.width, 0);
    const imageHeight = toPositiveInt(imageDataLike.height, 0);
    if (!imageWidth || !imageHeight) {
      return null;
    }

    const srcPixels = imageDataLike.data instanceof Uint8ClampedArray
      ? imageDataLike.data
      : new Uint8ClampedArray(imageDataLike.data);

    const canvas = createCanvas(imageWidth, imageHeight);
    const context = canvas.getContext('2d');
    const targetImageData = context.createImageData(imageWidth, imageHeight);
    targetImageData.data.set(srcPixels.subarray(0, targetImageData.data.length));
    context.putImageData(targetImageData, 0, 0);
    return canvas;
  };

  const resolveMaskSource = (mask) => {
    if (!mask) return null;
    if (mask?.canvas && typeof mask.canvas.getContext === 'function') {
      return mask.canvas;
    }
    if (mask?.imageData) {
      return toCanvasFromImageData(mask.imageData);
    }
    return null;
  };

  const normalizeLayerOpacity = (opacityValue) => {
    const parsed = Number(opacityValue);
    if (!Number.isFinite(parsed)) return 1;
    if (parsed <= 1) return Math.max(0, Math.min(1, parsed));
    return Math.max(0, Math.min(1, parsed / 255));
  };

  for (const designLayer of designLayers) {
    const bounds = getLayerBounds(designLayer);
    const overlayCanvas = createCanvas(width, height);
    const overlayContext = overlayCanvas.getContext('2d');
    overlayContext.drawImage(
      designImage,
      toSafeInt(bounds.left, 0),
      toSafeInt(bounds.top, 0),
      toPositiveInt(bounds.width, 1),
      toPositiveInt(bounds.height, 1)
    );

    const maskSource = resolveMaskSource(designLayer?.mask);
    if (maskSource) {
      const maskBounds = getLayerBounds(designLayer.mask);
      overlayContext.save();
      overlayContext.globalCompositeOperation = 'destination-in';
      overlayContext.drawImage(
        maskSource,
        toSafeInt(maskBounds.left, 0),
        toSafeInt(maskBounds.top, 0),
        toPositiveInt(maskBounds.width, 1),
        toPositiveInt(maskBounds.height, 1)
      );
      overlayContext.restore();
    }

    outputContext.save();
    outputContext.globalAlpha = normalizeLayerOpacity(designLayer?.opacity ?? 1);
    outputContext.globalCompositeOperation = mapBlendModeToCanvas(designLayer?.blendMode);
    outputContext.drawImage(overlayCanvas, 0, 0, width, height);
    outputContext.restore();
  }

  const pngBuffer = outputCanvas.toBuffer('image/png');

  return {
    templatePath: psdPath,
    replacedDesignLayerCount: designLayers.length,
    count: 1,
    outputs: [
      {
        name: `${path.parse(psdPath).name || 'mockup'}-preview-patch.png`,
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      },
    ],
    warning: 'Renderer preview-patch giữ nguyên flattened preview Photoshop; ảnh mới được overlay theo bounds Design và áp mask/opacity/blend mode của layer Design khi có.',
  };
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => {
      if (!chunk) return;
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error('Dữ liệu ảnh không hợp lệ (không phải data URL base64)');
  }

  return {
    mimeType: match[1] || 'image/png',
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashBuffer(buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}

async function resolveSourceImageDataUrl(sourceUrl) {
  const normalized = String(sourceUrl || '').trim();
  if (!normalized) {
    throw new Error('Thiếu ảnh nguồn để gửi Gemini App.');
  }

  if (normalized.startsWith('data:image/')) {
    return normalized;
  }

  const response = await fetch(normalized, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Không thể tải ảnh nguồn (HTTP ${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = String(response.headers.get('content-type') || 'image/png').split(';')[0].trim() || 'image/png';
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

function getGeminiChatSessionFilePath() {
  return path.join(app.getPath('userData'), GEMINI_CHAT_SESSION_FILE);
}

function normalizeGeminiProjectUrl(url) {
  const normalized = String(url || '').trim();
  return normalized || GEMINI_APP_URL;
}

function extractGeminiChatId(url) {
  const match = String(url || '').match(/\/app\/([^/?#]+)/i);
  return match ? String(match[1] || '').trim() : '';
}

async function loadGeminiChatSession() {
  const filePath = getGeminiChatSessionFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      chatId: String(parsed.chatId || '').trim(),
      chatUrl: normalizeGeminiProjectUrl(parsed.chatUrl),
      accountFingerprint: String(parsed.accountFingerprint || '').trim(),
      updatedAt: String(parsed.updatedAt || '').trim(),
    };
  } catch {
    return null;
  }
}

async function saveGeminiChatSession({ chatId = '', chatUrl = GEMINI_APP_URL, accountFingerprint = '' } = {}) {
  const filePath = getGeminiChatSessionFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const payload = {
    chatId: String(chatId || '').trim(),
    chatUrl: normalizeGeminiProjectUrl(chatUrl),
    accountFingerprint: String(accountFingerprint || '').trim(),
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}${os.EOL}`, 'utf8');
  return payload;
}

async function clearGeminiChatSession() {
  const filePath = getGeminiChatSessionFilePath();
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore if file does not exist.
  }
}

function buildGeminiAccountFingerprint(cookies = []) {
  const identityCookieNames = new Set([
    'SID',
    'HSID',
    'SSID',
    'APISID',
    'SAPISID',
    '__Secure-1PSID',
    '__Secure-3PSID',
    '__Secure-1PAPISID',
    '__Secure-3PAPISID',
  ]);

  const stableParts = (Array.isArray(cookies) ? cookies : [])
    .filter((cookie) => identityCookieNames.has(String(cookie?.name || '').trim()))
    .map((cookie) => `${String(cookie?.name || '').trim()}=${String(cookie?.value || '').trim().slice(0, 24)}`)
    .sort();

  if (!stableParts.length) {
    return '';
  }

  return hashBuffer(Buffer.from(stableParts.join('|'), 'utf8'));
}

async function readGeminiCookiesFromWindow(geminiWindow) {
  if (!geminiWindow || geminiWindow.isDestroyed()) {
    return [];
  }

  try {
    const sessionCookies = await geminiWindow.webContents.session.cookies.get({ url: GEMINI_APP_URL });
    return Array.isArray(sessionCookies) ? sessionCookies : [];
  } catch {
    return [];
  }
}

async function syncGeminiChatSession({ geminiWindow, fallbackUrl = GEMINI_APP_URL } = {}) {
  const normalizedFallback = normalizeGeminiProjectUrl(fallbackUrl);
  const currentUrl = geminiWindow && !geminiWindow.isDestroyed()
    ? normalizeGeminiProjectUrl(geminiWindow.webContents.getURL() || normalizedFallback)
    : normalizedFallback;
  const currentChatId = extractGeminiChatId(currentUrl);
  const cookies = await readGeminiCookiesFromWindow(geminiWindow);
  const accountFingerprint = buildGeminiAccountFingerprint(cookies);
  const persisted = await loadGeminiChatSession();

  if (
    persisted?.accountFingerprint
    && accountFingerprint
    && persisted.accountFingerprint !== accountFingerprint
  ) {
    await clearGeminiChatSession();
  }

  if (currentChatId) {
    const saved = await saveGeminiChatSession({
      chatId: currentChatId,
      chatUrl: currentUrl,
      accountFingerprint,
    });
    return {
      ...saved,
      cookies,
      isNewChat: !persisted?.chatId || persisted.chatId !== currentChatId,
    };
  }

  const safePersisted = await loadGeminiChatSession();
  return {
    chatId: safePersisted?.chatId || '',
    chatUrl: safePersisted?.chatUrl || normalizedFallback,
    accountFingerprint: safePersisted?.accountFingerprint || accountFingerprint,
    cookies,
    isNewChat: false,
  };
}

function getGeminiChromeProfileDir() {
  return path.join(app.getPath('userData'), GEMINI_CHROME_PROFILE_DIRNAME);
}

function isGeminiChromeAlive() {
  return Boolean(geminiChromeProcess && !geminiChromeProcess.killed);
}

function getGeminiChromeState() {
  return {
    running: isGeminiChromeAlive(),
    pid: geminiChromeProcess?.pid || null,
    executablePath: geminiChromeExecutablePath || null,
    userDataDir: getGeminiChromeProfileDir(),
    debugPort: GEMINI_CHROME_DEBUG_PORT,
  };
}

async function resolveChromeExecutable() {
  const fromEnv = String(process.env.OFFOREST_CHROME_EXE || '').trim();
  if (fromEnv) {
    await fs.access(fromEnv);
    return fromEnv;
  }

  const candidates = process.platform === 'win32'
    ? [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium'];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error('Khong tim thay Google Chrome. Hay set OFFOREST_CHROME_EXE den duong dan chrome.exe');
}

async function ensureGeminiChromeProcess({ startUrl = GEMINI_APP_URL } = {}) {
  if (isGeminiChromeAlive()) {
    return getGeminiChromeState();
  }

  const executablePath = await resolveChromeExecutable();
  const profileDir = getGeminiChromeProfileDir();
  await fs.mkdir(profileDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${GEMINI_CHROME_DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    String(startUrl || GEMINI_APP_URL),
  ];

  const chromeProcess = spawn(executablePath, args, {
    stdio: 'ignore',
    windowsHide: false,
    detached: false,
  });

  geminiChromeExecutablePath = executablePath;
  geminiChromeProcess = chromeProcess;

  chromeProcess.on('exit', () => {
    if (geminiChromeProcess === chromeProcess) {
      geminiChromeProcess = null;
    }
  });

  await sleep(1200);
  return getGeminiChromeState();
}

async function openUrlInGeminiChrome(url) {
  const startUrl = String(url || GEMINI_APP_URL);
  const state = await ensureGeminiChromeProcess({ startUrl });
  // Keep only one persistent Chrome process/tab unless user manually opens more.
  return getGeminiChromeState();
}

function stopGeminiChromeProcess() {
  if (!isGeminiChromeAlive()) {
    return;
  }

  try {
    geminiChromeProcess.kill();
  } catch {
    // best-effort shutdown
  }
  geminiChromeProcess = null;
}

async function ensureGeminiAppWindow() {
  if (geminiAppWindow && !geminiAppWindow.isDestroyed()) {
    return geminiAppWindow;
  }

  geminiAppWindow = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 980,
    minHeight: 720,
    autoHideMenuBar: true,
    show: false,
    title: 'Gemini App - Offorest Bridge',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:offorest-gemini-app',
    },
  });

  geminiAppWindow.on('closed', () => {
    geminiAppWindow = null;
  });

  await geminiAppWindow.loadURL(GEMINI_APP_URL);
  return geminiAppWindow;
}

async function waitForClipboardOutputImage({ sourceHash, timeoutMs }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const clipboardImage = clipboard.readImage();
    if (!clipboardImage.isEmpty()) {
      const pngBuffer = clipboardImage.toPNG();
      const nextHash = hashBuffer(pngBuffer);
      if (nextHash !== sourceHash) {
        return {
          base64: pngBuffer.toString('base64'),
          mimeType: 'image/png',
        };
      }
    }

    await sleep(1200);
  }

  throw new Error('Hết thời gian chờ ảnh kết quả. Hãy copy ảnh output từ Gemini App rồi thử lại.');
}

async function autoPasteAndSubmitToGemini(geminiWindow, { prompt = '', sourceNativeImage = null } = {}) {
  if (!geminiWindow || geminiWindow.isDestroyed()) {
    return false;
  }

  const webContents = geminiWindow.webContents;
  await webContents.executeJavaScript(`
    (() => {
      const selectors = ['textarea', '[contenteditable="true"]', '[role="textbox"]'];
      const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
      const visible = candidates.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const target = visible[visible.length - 1] || candidates[candidates.length - 1] || null;
      if (!target) return false;

      target.focus();
      target.click();
      return true;
    })();
  `, true);

  await sleep(150);
  if (prompt) {
    webContents.insertText(String(prompt));
  }

  if (sourceNativeImage && !sourceNativeImage.isEmpty()) {
    clipboard.write({ image: sourceNativeImage });

    await sleep(150);
    webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Control' });
    webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
    webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
    webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Control' });
  }

  await sleep(450);
  webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  return true;
}

async function tryAutoCopyImageFromGemini(geminiWindow) {
  if (!geminiWindow || geminiWindow.isDestroyed()) {
    return false;
  }

  try {
    const didClick = await geminiWindow.webContents.executeJavaScript(`
      (() => {
        const normalize = (value) => String(value || '').toLowerCase().trim();
        const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));

        const exactCopyImage = [...nodes].reverse().find((node) => {
          const text = normalize(node.innerText);
          const label = normalize(node.getAttribute('aria-label'));
          const title = normalize(node.getAttribute('title'));
          const combined = [text, label, title].join(' ');
          return combined.includes('copy image')
            || combined.includes('sao chép hình ảnh')
            || combined.includes('sao chep hinh anh');
        });

        if (exactCopyImage) {
          exactCopyImage.click();
          return true;
        }

        const fallbackCopy = [...nodes].reverse().find((node) => {
          const text = normalize(node.innerText);
          const label = normalize(node.getAttribute('aria-label'));
          const title = normalize(node.getAttribute('title'));
          const combined = [text, label, title].join(' ');
          return combined === 'copy' || combined.includes('copy to clipboard') || combined.includes('sao chép');
        });

        if (fallbackCopy) {
          fallbackCopy.click();
          return true;
        }

        return false;
      })();
    `, true);

    return Boolean(didClick);
  } catch {
    return false;
  }
}

async function isGeminiStillGenerating(geminiWindow) {
  if (!geminiWindow || geminiWindow.isDestroyed()) {
    return false;
  }

  try {
    return Boolean(await geminiWindow.webContents.executeJavaScript(`
      (() => {
        const normalize = (value) => String(value || '').toLowerCase().trim();
        const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
        return nodes.some((node) => {
          const text = normalize(node.innerText);
          const label = normalize(node.getAttribute('aria-label'));
          const title = normalize(node.getAttribute('title'));
          const combined = [text, label, title].join(' ');
          return combined.includes('stop generating')
            || combined.includes('stop response')
            || combined.includes('dung tao')
            || combined.includes('dừng tạo');
        });
      })();
    `, true));
  } catch {
    return false;
  }
}

async function waitForGeminiOutputImage({ sourceHash, timeoutMs, geminiWindow }) {
  const startedAt = Date.now();
  let attempts = 0;
  const minWaitBeforeCopyMs = 2500;

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    const elapsedMs = Date.now() - startedAt;
    if (attempts % 2 === 0 && elapsedMs >= minWaitBeforeCopyMs) {
      const stillGenerating = await isGeminiStillGenerating(geminiWindow);
      if (!stillGenerating) {
        await tryAutoCopyImageFromGemini(geminiWindow);
      }
    }

    const clipboardImage = clipboard.readImage();
    if (!clipboardImage.isEmpty()) {
      const pngBuffer = clipboardImage.toPNG();
      const nextHash = hashBuffer(pngBuffer);
      if (nextHash !== sourceHash && nextHash !== geminiLastOutputHash) {
        geminiLastOutputHash = nextHash;
        return {
          base64: pngBuffer.toString('base64'),
          mimeType: 'image/png',
        };
      }
    }

    await sleep(1200);
  }

  throw new Error('Không tự lấy được ảnh từ Gemini App. Hãy mở kết quả và copy ảnh thủ công, sau đó thử lại.');
}

async function resolvePhotoshopExecutable() {
  const fromEnv = String(process.env.OFFOREST_PHOTOSHOP_EXE || '').trim();
  if (fromEnv) {
    await fs.access(fromEnv);
    return fromEnv;
  }

  const candidates = [
    'C:/Program Files/Adobe/Adobe Photoshop 2026/Photoshop.exe',
    'C:/Program Files/Adobe/Adobe Photoshop 2025/Photoshop.exe',
    'C:/Program Files/Adobe/Adobe Photoshop 2024/Photoshop.exe',
    'C:/Program Files/Adobe/Adobe Photoshop 2023/Photoshop.exe',
    'C:/Program Files/Adobe/Adobe Photoshop 2022/Photoshop.exe',
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error('Không tìm thấy Photoshop.exe. Hãy set OFFOREST_PHOTOSHOP_EXE tới đường dẫn Photoshop.exe');
}

function sanitizeForFileName(name, fallback = 'MOCKUP') {
  const value = String(name || '').trim() || fallback;
  return value.replace(/[\\/:*?"<>|]+/g, '_');
}

function jsxPathLiteral(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/'/g, "\\'");
}

function buildPhotoshopRenderJsx({ psdPath, designImagePath, outputDir }) {
  const psd = jsxPathLiteral(psdPath);
  const image = jsxPathLiteral(designImagePath);
  const out = jsxPathLiteral(outputDir);

  return [
    '#target photoshop',
    'app.displayDialogs = DialogModes.NO;',
    '',
    'function isDesignLayer(layer) {',
    "  var n = String(layer.name || '').toLowerCase();",
    "  return n === 'design' || n === 'desgin';",
    '}',
    '',
    'function findDesignLayers(parent, result, insideMockupGroup) {',
    '  var layers = parent.layers;',
    '  for (var i = 0; i < layers.length; i++) {',
    '    var layer = layers[i];',
    "    var isMockupGroup = layer.typename === 'LayerSet' && /^\\s*mockup\\s+\\d+\\s*$/i.test(String(layer.name || ''));",
    "    if (!insideMockupGroup && layer.typename === 'ArtLayer' && isDesignLayer(layer)) {",
    '      result.push(layer);',
    '    }',
    "    if (layer.typename === 'LayerSet') {",
    '      findDesignLayers(layer, result, insideMockupGroup || isMockupGroup);',
    '    }',
    '  }',
    '}',
    '',
    'function findLayerByName(parent, name, insideMockupGroup) {',
    '  var expectedName = String(name || "").toLowerCase();',
    '  var layers = parent.layers;',
    '  for (var i = 0; i < layers.length; i++) {',
    '    var layer = layers[i];',
    '    var isMockupGroup = layer.typename === "LayerSet" && /^\\s*mockup\\s+\\d+\\s*$/i.test(String(layer.name || ""));',
    '    if (!insideMockupGroup && String(layer.name || "").toLowerCase() === expectedName) return layer;',
    '    if (layer.typename === "LayerSet") {',
    '      var nested = findLayerByName(layer, name, insideMockupGroup || isMockupGroup);',
    '      if (nested) return nested;',
    '    }',
    '  }',
    '  return null;',
    '}',
    '',
    'function getBoundsInPixels(layer) {',
    '  var bounds = layer.bounds;',
    '  var left = bounds[0].as("px");',
    '  var top = bounds[1].as("px");',
    '  var right = bounds[2].as("px");',
    '  var bottom = bounds[3].as("px");',
    '  var width = right - left;',
    '  var height = bottom - top;',
    '  if (width <= 0 || height <= 0) return null;',
    '  return { left: left, top: top, width: width, height: height };',
    '}',
    '',
    'function resizeLayerToBounds(layer, targetBounds) {',
    '  var sourceBounds = getBoundsInPixels(layer);',
    '  if (!sourceBounds || !targetBounds) return;',
    '  layer.resize((targetBounds.width / sourceBounds.width) * 100, (targetBounds.height / sourceBounds.height) * 100, AnchorPosition.TOPLEFT);',
    '  sourceBounds = getBoundsInPixels(layer);',
    '  layer.translate(targetBounds.left - sourceBounds.left, targetBounds.top - sourceBounds.top);',
    '}',
    '',
    'function replaceSmartObjectContent(layer, imagePath) {',
    '  app.activeDocument.activeLayer = layer;',
    "  if (layer.kind !== LayerKind.SMARTOBJECT) return;",
    '  executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);',
    '  var soDoc = app.activeDocument;',
    '  var img = new File(imagePath);',
    '  var opened = app.open(img);',
    '  opened.activeLayer.duplicate(soDoc);',
    '  opened.close(SaveOptions.DONOTSAVECHANGES);',
    '  var newLayer = soDoc.activeLayer;',
    '  var templateLayer = findLayerByName(soDoc, "Template");',
    '  var targetBounds = templateLayer ? getBoundsInPixels(templateLayer) : null;',
    '  if (targetBounds) {',
    '    resizeLayerToBounds(newLayer, targetBounds);',
    '  } else {',
    '    var soW = soDoc.width.as("px");',
    '    var soH = soDoc.height.as("px");',
    '    var b = newLayer.bounds;',
    '    var lw = b[2].as("px") - b[0].as("px");',
    '    var lh = b[3].as("px") - b[1].as("px");',
    '    var ratio = Math.min(soW / lw, soH / lh) * 100;',
    '    newLayer.resize(ratio, ratio, AnchorPosition.MIDDLECENTER);',
    '    b = newLayer.bounds;',
    '    var dx = (soW - (b[2].as("px") - b[0].as("px"))) / 2 - b[0].as("px");',
    '    var dy = (soH - (b[3].as("px") - b[1].as("px"))) / 2 - b[1].as("px");',
    '    newLayer.translate(dx, dy);',
    '  }',
    '  if (soDoc.layers.length > 1) {',
    '    for (var i = 1; i < soDoc.layers.length; i++) { soDoc.layers[i].visible = false; }',
    '  }',
    '  soDoc.close(SaveOptions.SAVECHANGES);',
    '}',
    '',
    'function collectTopMockupGroups(doc) {',
    '  var groups = [];',
    '  for (var i = 0; i < doc.layerSets.length; i++) {',
    '    var g = doc.layerSets[i];',
    "    if (/^\\s*mockup\\s+\\d+\\s*$/i.test(String(g.name || ''))) groups.push(g);",
    '  }',
    '  groups.sort(function(a, b) {',
    '    var an = parseInt(String(a.name).replace(/[^0-9]/g, ""), 10) || 999999;',
    '    var bn = parseInt(String(b.name).replace(/[^0-9]/g, ""), 10) || 999999;',
    '    return an - bn;',
    '  });',
    '  return groups;',
    '}',
    '',
    'function savePng(doc, outPath) {',
    '  var pngOpts = new PNGSaveOptions();',
    '  pngOpts.interlaced = false;',
    '  doc.saveAs(new File(outPath), pngOpts, true, Extension.LOWERCASE);',
    '}',
    '',
    'function safeOutputName(value) {',
    '  var name = String(value || "MOCKUP");',
    '  var invalidChars = "\\\\/:*?\\\"<>|";',
    '  var result = "";',
    '  for (var i = 0; i < name.length; i++) {',
    '    var character = name.charAt(i);',
    '    result += invalidChars.indexOf(character) >= 0 ? "_" : character;',
    '  }',
    '  return result || "MOCKUP";',
    '}',
    '',
    '(function main() { try {',
    `  var psdFile = new File('${psd}');`,
    `  var imageFile = new File('${image}');`,
    `  var outputDir = new Folder('${out}');`,
    '  if (!psdFile.exists) throw new Error("PSD không tồn tại");',
    '  if (!imageFile.exists) throw new Error("Ảnh design không tồn tại");',
    '  if (!outputDir.exists) outputDir.create();',
    '  var doc = app.open(psdFile);',
    '  var rootTemplate = findLayerByName(doc, "Template", false);',
    '  var rootTemplateBounds = rootTemplate ? getBoundsInPixels(rootTemplate) : null;',
    '  var designLayers = [];',
    '  findDesignLayers(doc, designLayers, false);',
    '  if (!designLayers.length) throw new Error("Không tìm thấy layer Design/Desgin");',
    '  for (var i = 0; i < designLayers.length; i++) {',
    '    replaceSmartObjectContent(designLayers[i], imageFile.fsName);',
    '    if (rootTemplateBounds) resizeLayerToBounds(designLayers[i], rootTemplateBounds);',
    '    app.activeDocument = doc;',
    '  }',
    '  var groups = collectTopMockupGroups(doc);',
    '  if (!groups.length) {',
    '    savePng(doc, outputDir.fsName + "/MOCKUP.png");',
    '  } else {',
    '    var original = [];',
    '    for (var g = 0; g < groups.length; g++) { original.push(groups[g].visible); }',
    '    for (var j = 0; j < groups.length; j++) {',
    '      for (var k = 0; k < groups.length; k++) groups[k].visible = k === j;',
    '      var safe = safeOutputName(groups[j].name);',
    '      savePng(doc, outputDir.fsName + "/" + safe + ".png");',
    '    }',
    '    for (var r = 0; r < groups.length; r++) groups[r].visible = original[r];',
    '  }',
    '  doc.close(SaveOptions.DONOTSAVECHANGES);',
    '  var doneFile = new File(outputDir.fsName + "/.offorest-complete");',
    '  doneFile.open("w");',
    '  doneFile.write("done");',
    '  doneFile.close();',
    '} catch (error) {',
    '  var errorFile = new File(outputDir.fsName + "/.offorest-error.txt");',
    '  errorFile.open("w");',
    '  errorFile.write(String(error));',
    '  errorFile.close();',
    '  throw error;',
    '}',
    '})();',
    '',
  ].join('\n');
}

async function renderMockupsWithPhotoshopEngine({ psdPath, designDataUrl }) {
  if (!psdPath) {
    throw new Error('Thiếu đường dẫn file PSD');
  }
  if (!designDataUrl || !String(designDataUrl).startsWith('data:image/')) {
    throw new Error('Thiếu ảnh redesign hợp lệ để gắn vào layer Design');
  }

  const photoshopExe = await resolvePhotoshopExecutable();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'offorest-ps-'));
  const outputDir = path.join(tempRoot, 'outputs');
  await fs.mkdir(outputDir, { recursive: true });

  const { mimeType, buffer } = dataUrlToBuffer(designDataUrl);
  const extension = mimeType.includes('png') ? 'png' : (mimeType.includes('webp') ? 'webp' : 'png');
  const designImagePath = path.join(tempRoot, `design-input.${extension}`);
  await fs.writeFile(designImagePath, buffer);

  const scriptPath = path.join(tempRoot, 'render-mockups.jsx');
  const scriptContent = buildPhotoshopRenderJsx({
    psdPath,
    designImagePath,
    outputDir,
  });
  await fs.writeFile(scriptPath, scriptContent, 'utf8');

  const completionPath = path.join(outputDir, '.offorest-complete');
  const errorPath = path.join(outputDir, '.offorest-error.txt');
  let launchError = null;
  const photoshopProcess = spawn(photoshopExe, ['-r', scriptPath], {
    windowsHide: true,
    stdio: 'ignore',
  });
  photoshopProcess.once('error', (error) => {
    launchError = error;
  });

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    try {
      await fs.access(completionPath);
      break;
    } catch {
      try {
        const scriptError = (await fs.readFile(errorPath, 'utf8')).trim();
        throw new Error(`Photoshop script failed: ${scriptError || 'unknown error'}`);
      } catch (error) {
        if (String(error?.message || '').startsWith('Photoshop script failed:')) throw error;
      }
      await sleep(250);
    }
  }
  try {
    await fs.access(completionPath);
  } catch {
    throw new Error('Photoshop không báo hoàn tất export PNG trong 10 phút.');
  }

  const outputFiles = (await fs.readdir(outputDir))
    .filter((name) => /\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (!outputFiles.length) {
    throw new Error('Photoshop đã chạy nhưng không tạo PNG nào. Kiểm tra layer Design/Smart Object và group MOCKUP * trong PSD.');
  }

  const outputs = [];
  for (const fileName of outputFiles) {
    const fileBuffer = await fs.readFile(path.join(outputDir, fileName));
    outputs.push({
      name: sanitizeForFileName(fileName, 'MOCKUP.png'),
      dataUrl: `data:image/png;base64,${fileBuffer.toString('base64')}`,
    });
  }

  return {
    templatePath: psdPath,
    replacedDesignLayerCount: 1,
    count: outputs.length,
    outputs,
    warning: 'Đã render bằng Photoshop engine để giữ effect sát nhất.',
  };
}

async function renderLocalMockupWithFallbacks({ psdPath, designDataUrl }) {
  let primaryError;
  try {
    return await renderMockupsFromPsd({ psdPath, designDataUrl });
  } catch (error) {
    primaryError = error;
    if (!/invalid svg image/i.test(String(error?.message || ''))) {
      throw error;
    }
    try {
      console.warn('[LocalMockupWorker] ag-psd gặp SVG không hợp lệ; chuyển sang Photoshop', error?.message);
    } catch (logError) {
      if (logError?.code !== 'EPIPE') throw logError;
    }
  }

  try {
    const photoshopResult = await renderMockupsWithPhotoshopEngine({ psdPath, designDataUrl });
    return {
      ...photoshopResult,
      warning: `Đã fallback sang Photoshop sau lỗi ag-psd: ${primaryError?.message || 'Invalid SVG image'}`,
    };
  } catch (photoshopError) {
    throw new Error(`Không thể render PSD sau lỗi SVG. ag-psd: ${primaryError?.message || 'unknown error'}; Photoshop: ${photoshopError?.message || 'unknown error'}`);
  }
}

async function renderMockupsFromPsdPreview({ psdPath }) {
  if (!psdPath) {
    throw new Error('Thiếu đường dẫn file PSD');
  }

  const psd = PSD.fromFile(psdPath);
  psd.parse();

  const previewPng = psd.image?.toPng?.();
  if (!previewPng || typeof previewPng.pack !== 'function') {
    throw new Error('Không đọc được flattened preview từ PSD. Hãy bật Maximize Compatibility khi lưu PSD.');
  }

  const pngBuffer = await streamToBuffer(previewPng.pack());

  return {
    templatePath: psdPath,
    replacedDesignLayerCount: 0,
    count: 1,
    outputs: [
      {
        name: 'MOCKUP-PREVIEW.png',
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      },
    ],
    warning: 'Renderer psd-preview chỉ dùng flattened preview từ Photoshop, không thay layer Design và không tách riêng từng folder MOCKUP *.',
  };
}

function imageDataLikeToPngDataUrl(imageDataLike) {
  if (!imageDataLike?.data || !imageDataLike?.width || !imageDataLike?.height) {
    return null;
  }

  const width = toPositiveInt(imageDataLike.width, 1);
  const height = toPositiveInt(imageDataLike.height, 1);
  const expectedLength = width * height * 4;
  const src = imageDataLike.data instanceof Uint8ClampedArray
    ? imageDataLike.data
    : new Uint8ClampedArray(imageDataLike.data);
  const rgba = Buffer.alloc(expectedLength);

  rgba.set(Buffer.from(src.subarray(0, Math.min(src.length, expectedLength))));

  const png = new PNG({ width, height });
  rgba.copy(png.data);
  const pngBuffer = PNG.sync.write(png);
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

async function preparePsdPreviewOverlay({ psdPath }) {
  if (!psdPath) {
    throw new Error('Thiếu đường dẫn file PSD');
  }

  const psdPreview = PSD.fromFile(psdPath);
  psdPreview.parse();

  const previewPng = psdPreview.image?.toPng?.();
  if (!previewPng || typeof previewPng.pack !== 'function') {
    throw new Error('Không đọc được flattened preview từ PSD. Hãy bật Maximize Compatibility khi lưu PSD.');
  }

  const previewBuffer = await streamToBuffer(previewPng.pack());
  const previewDataUrl = `data:image/png;base64,${previewBuffer.toString('base64')}`;

  const psdBuffer = await fs.readFile(psdPath);
  const psdMeta = readPsd(psdBuffer, {
    useImageData: true,
    useRawThumbnail: false,
    skipLayerImageData: false,
    skipCompositeImageData: true,
  });

  const designLayerCandidates = [];
  walkLayers(psdMeta?.children || [], (layer) => {
    if (!isDesignTargetLayer(layer)) return;
    if (!isLayerVisible(layer)) return;

    const bounds = getLayerBounds(layer);
    const layerMask = layer?.mask;
    const maskBounds = layerMask ? getLayerBounds(layerMask) : null;
    const maskDataUrl = imageDataLikeToPngDataUrl(layerMask?.imageData);

    designLayerCandidates.push({
      name: String(layer?.name || 'Design'),
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      opacity: normalizeEffectOpacity(layer?.opacity ?? 1),
      blendMode: mapBlendModeToCanvas(layer?.blendMode),
      mask: maskBounds && maskDataUrl
        ? {
          left: maskBounds.left,
          top: maskBounds.top,
          width: maskBounds.width,
          height: maskBounds.height,
          dataUrl: maskDataUrl,
        }
        : null,
    });
  });

  // Default behavior: replace only one topmost visible Design layer to avoid stacking artifacts.
  // Set OFFOREST_REPLACE_ALL_DESIGN_LAYERS=true to replace every visible Design layer.
  const replaceAllDesignLayers = String(process.env.OFFOREST_REPLACE_ALL_DESIGN_LAYERS || '').toLowerCase() === 'true';
  const designLayers = replaceAllDesignLayers
    ? designLayerCandidates
    : (designLayerCandidates.length ? [designLayerCandidates[designLayerCandidates.length - 1]] : []);

  if (!designLayers.length) {
    throw new Error('Không tìm thấy layer tên "Design" hoặc "Desgin" trong file PSD.');
  }

  return {
    templatePath: psdPath,
    width: toPositiveInt(psdMeta?.width, 1),
    height: toPositiveInt(psdMeta?.height, 1),
    previewDataUrl,
    designLayers,
    warning: replaceAllDesignLayers
      ? 'WebGL overlay đang thay tất cả Design layer hiển thị (OFFOREST_REPLACE_ALL_DESIGN_LAYERS=true).'
      : 'WebGL overlay đang thay 1 Design layer hiển thị trên cùng để giữ bố cục/effect ổn định nhất.',
  };
}

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

function registerMockupIpc() {
  ipcMain.handle('local-mockup-worker:pick-storage-root', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Chọn thư mục dữ liệu local',
      properties: ['openDirectory'],
    });
    return { canceled: result.canceled, directoryPath: result.filePaths?.[0] || '' };
  });

  ipcMain.handle('local-mockup-worker:pick-xlap-project', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Chọn thư mục project XLAP',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true, storageRoot: '' };
    const storageRoot = await resolveXlapPublicStorageRoot(result.filePaths[0]);
    return { canceled: false, storageRoot };
  });

  ipcMain.handle('local-mockup-worker:read-output-image', async (_event, payload) => {
    return { dataUrl: await readLocalMockupOutputDataUrl(payload?.outputUrl) };
  });

  ipcMain.handle('local-mockup-worker:config', async () => {
    const config = await getLocalMockupWorkerConfig();
    return { ...config, password: config.password ? '***' : '' };
  });

  ipcMain.handle('local-mockup-worker:save-config', async (_event, payload) => {
    const saved = await saveLocalMockupWorkerConfig(payload);
    if (localMockupWorkerTimer) {
      stopLocalMockupWorker();
      await startLocalMockupWorker();
    }
    return saved;
  });

  ipcMain.handle('local-mockup-worker:start', async () => {
    if (!IS_LOCAL_MOCKUP_WORKER_PROCESS) return getLocalMockupWorkerStatus();
    return startLocalMockupWorker();
  });
  ipcMain.handle('local-mockup-worker:stop', async () => {
    if (!IS_LOCAL_MOCKUP_WORKER_PROCESS) return getLocalMockupWorkerStatus();
    return stopLocalMockupWorker();
  });
  ipcMain.handle('local-mockup-worker:status', async () => getLocalMockupWorkerStatus());

  ipcMain.handle('mockup:resolve-image-data-url', async (_event, payload) => {
    const sourceUrl = String(payload?.sourceUrl || '').trim();
    if (!sourceUrl) {
      throw new Error('Thiếu đường dẫn ảnh nguồn');
    }

    if (sourceUrl.startsWith('data:image/')) {
      return { dataUrl: sourceUrl };
    }

    const response = await fetch(sourceUrl, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Không thể tải ảnh nguồn (HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = String(response.headers.get('content-type') || 'image/png').split(';')[0].trim() || 'image/png';
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return { dataUrl: `data:${mimeType};base64,${base64}` };
  });

  ipcMain.handle('mockup:default-psd', async () => {
    const appRoot = app.getAppPath();
    const candidates = [
      path.join(appRoot, 'mockup', 'MOCKUP.psd'),
      path.join(appRoot, 'src', 'mockup', 'MOCKUP.psd'),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return { filePath: candidate };
      } catch {
        // Continue to next candidate.
      }
    }

    return { filePath: null };
  });

  ipcMain.handle('mockup:pick-psd', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Chọn file MOCKUP.psd',
      properties: ['openFile'],
      filters: [{ name: 'Photoshop File', extensions: ['psd'] }],
    });

    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true, filePath: null };
    }

    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle('mockup:prepare-preview-overlay', async (_event, payload) => {
    const psdPath = String(payload?.psdPath || '').trim();
    try {
      return await preparePsdPreviewOverlay({ psdPath });
    } catch (error) {
      throw new Error(`PSD prepare failed (${path.basename(psdPath || 'unknown.psd')}): ${error?.message || 'unknown error'}`);
    }
  });

  ipcMain.handle('mockup:render-psd', async (_event, payload) => {
    const psdPath = String(payload?.psdPath || '').trim();
    const designDataUrl = String(payload?.designDataUrl || '');
    const renderer = String(
      payload?.renderer || process.env.OFFOREST_PSD_RENDERER || 'ag-psd'
    ).trim().toLowerCase();
    const preferPhotoshopOverride = payload?.preferPhotoshop;
    const preferPhotoshopForAgPsd = typeof preferPhotoshopOverride === 'boolean'
      ? preferPhotoshopOverride
      : String(process.env.OFFOREST_PSD_PREFER_PHOTOSHOP ?? 'true').trim().toLowerCase() !== 'false';

    try {
      if (renderer === 'photoshop-engine' || renderer === 'photoshop') {
        try {
          return await renderMockupsWithPhotoshopEngine({ psdPath, designDataUrl });
        } catch (photoshopError) {
          try {
            const fallback = await renderMockupsFromPsd({ psdPath, designDataUrl });
            return {
              ...fallback,
              warning: `Không chạy được Photoshop engine, đã fallback sang ag-psd (có thể mất skew/perspective phức tạp): ${photoshopError?.message || 'unknown error'}`,
            };
          } catch (agPsdError) {
            const fallback = await renderPsdPreviewWithDesignPatch({ psdPath, designDataUrl });
            return {
              ...fallback,
              warning: `Không chạy được Photoshop engine và ag-psd, đã fallback sang preview-patch: ${photoshopError?.message || 'unknown error'} | ag-psd: ${agPsdError?.message || 'unknown error'}`,
            };
          }
        }
      }

      if (renderer === 'psd' || renderer === 'psd-preview') {
        return await renderMockupsFromPsdPreview({ psdPath });
      }

      if (
        renderer === 'psd-preview-patch'
        || renderer === 'preview-patch'
        || renderer === 'preserve-effects'
      ) {
        return await renderPsdPreviewWithDesignPatch({ psdPath, designDataUrl });
      }

      if (
        renderer === 'ag-psd-full'
        || renderer === 'replace-design-full'
        || renderer === 'full-preserve'
      ) {
        return await renderPsdReplaceDesignFull({ psdPath, designDataUrl });
      }

      if (renderer === 'ag-psd') {
        return await renderLocalMockupWithFallbacks({ psdPath, designDataUrl });
      }

      return await renderLocalMockupWithFallbacks({ psdPath, designDataUrl });
    } catch (error) {
      throw new Error(
        `PSD render failed (${path.basename(psdPath || 'unknown.psd')}, renderer: ${renderer}): ${error?.message || 'unknown error'}`
      );
    }
  });

  ipcMain.handle('mockup:render-psd-progressive', async (event, payload) => {
    const psdPath = String(payload?.psdPath || '').trim();
    const designDataUrl = String(payload?.designDataUrl || '');
    const requestId = String(payload?.requestId || '').trim();

    try {
      return await renderMockupsFromPsd({
        psdPath,
        designDataUrl,
        skipCollectOutputs: true,
        onOutput: async (output, index, total) => {
          event.sender.send('mockup:render-psd-progress', {
            requestId,
            index,
            total,
            output,
          });
        },
      });
    } catch (error) {
      throw new Error(
        `PSD progressive render failed (${path.basename(psdPath || 'unknown.psd')}): ${error?.message || 'unknown error'}`
      );
    }
  });

  ipcMain.handle('mockup:render-template-preview', async (_event, payload) => {
    const psdPath = String(payload?.psdPath || '').trim();

    try {
      return await renderMockupTemplatePreviewFromPsd({ psdPath });
    } catch (error) {
      throw new Error(`PSD template preview failed (${path.basename(psdPath || 'unknown.psd')}): ${error?.message || 'unknown error'}`);
    }
  });
}

function registerAppLogIpc() {
  ipcMain.handle('app-log:path', async () => {
    return ensureRendererLogFile();
  });

  ipcMain.handle('app-log:append', async (_event, payload) => {
    const level = String(payload?.level || 'log').toUpperCase();
    const message = String(payload?.message || '');
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}${os.EOL}`;
    const logFilePath = await ensureRendererLogFile();
    await fs.appendFile(logFilePath, line, 'utf8');
    return { ok: true, path: logFilePath };
  });

  ipcMain.handle('app-log:read', async (_event, payload) => {
    const maxChars = Math.max(1000, Number(payload?.maxChars || 200000));
    const logFilePath = await ensureRendererLogFile();
    const fullText = await fs.readFile(logFilePath, 'utf8');
    const text = fullText.length > maxChars ? fullText.slice(fullText.length - maxChars) : fullText;
    return { path: logFilePath, text, truncated: fullText.length > maxChars, fullLength: fullText.length };
  });

  ipcMain.handle('app-log:clear', async () => {
    const logFilePath = await ensureRendererLogFile();
    await fs.writeFile(logFilePath, '', 'utf8');
    return { ok: true, path: logFilePath };
  });
}

function registerGeminiAppIpc() {
  ipcMain.removeHandler('gemini-app:bootstrap');
  ipcMain.handle('gemini-app:bootstrap', async (_event, payload) => {
    const projectUrl = String(payload?.projectUrl || GEMINI_APP_URL).trim() || GEMINI_APP_URL;
    const autoLogin = Boolean(payload?.autoLogin);

    const geminiWindow = await ensureGeminiAppWindow();
    if (geminiWindow.webContents.getURL() !== projectUrl) {
      await geminiWindow.loadURL(projectUrl);
    }
    if (autoLogin) {
      geminiWindow.show();
      geminiWindow.focus();
    }

    const sessionState = await syncGeminiChatSession({ geminiWindow, fallbackUrl: projectUrl });

    return {
      ready: true,
      auth: {
        isLoggedIn: true,
        mode: 'embedded-window',
      },
      chat: {
        persistent: true,
        url: sessionState.chatUrl,
        chatId: sessionState.chatId,
      },
      chrome: null,
    };
  });

  ipcMain.removeHandler('gemini-app:get-state');
  ipcMain.handle('gemini-app:get-state', async () => {
    const persisted = await loadGeminiChatSession();
    return {
      ready: true,
      auth: {
        isLoggedIn: true,
        mode: 'embedded-window',
      },
      chat: {
        persistent: true,
        url: persisted?.chatUrl || GEMINI_APP_URL,
        chatId: persisted?.chatId || '',
      },
      chrome: null,
    };
  });

  ipcMain.removeHandler('gemini-app:open-persistent-chat');
  ipcMain.handle('gemini-app:open-persistent-chat', async (_event, payload) => {
    const requestedUrl = String(payload?.projectUrl || GEMINI_APP_URL).trim() || GEMINI_APP_URL;
    const requestedChatId = extractGeminiChatId(requestedUrl);
    const persisted = await loadGeminiChatSession();
    const targetChatUrl = requestedChatId
      ? requestedUrl
      : (persisted?.chatUrl || requestedUrl || GEMINI_APP_URL);

    const geminiWindow = await ensureGeminiAppWindow();
    if (geminiWindow.webContents.getURL() !== targetChatUrl) {
      await geminiWindow.loadURL(targetChatUrl);
    }
    geminiWindow.show();
    geminiWindow.focus();

    const sessionState = await syncGeminiChatSession({ geminiWindow, fallbackUrl: targetChatUrl });

    return {
      ok: true,
      chatUrl: sessionState.chatUrl,
      chatId: sessionState.chatId,
      isNewChat: sessionState.isNewChat,
      chrome: null,
    };
  });

  ipcMain.removeHandler('gemini-app:get-cookies');
  ipcMain.handle('gemini-app:get-cookies', async () => {
    const geminiWindow = await ensureGeminiAppWindow();
    const cookies = await readGeminiCookiesFromWindow(geminiWindow);
    return {
      cookies,
      generatedAt: new Date().toISOString(),
      chrome: null,
    };
  });

  ipcMain.removeHandler('gemini-app:check-session');
  ipcMain.handle('gemini-app:check-session', async (_event, payload) => {
    const projectUrl = String(payload?.projectUrl || GEMINI_APP_URL).trim() || GEMINI_APP_URL;
    const geminiWindow = await ensureGeminiAppWindow();
    const sessionState = await syncGeminiChatSession({ geminiWindow, fallbackUrl: projectUrl });
    return {
      ok: true,
      projectUrl: sessionState.chatUrl,
      chatId: sessionState.chatId,
      cookies: sessionState.cookies,
      generatedAt: new Date().toISOString(),
      chrome: null,
      accountFingerprint: sessionState.accountFingerprint,
    };
  });

  ipcMain.removeHandler('gemini-app:open-login');
  ipcMain.handle('gemini-app:open-login', async (_event, payload) => {
    const projectUrl = String(payload?.projectUrl || GEMINI_APP_URL).trim() || GEMINI_APP_URL;
    const geminiWindow = await ensureGeminiAppWindow();
    if (geminiWindow.webContents.getURL() !== projectUrl) {
      await geminiWindow.loadURL(projectUrl);
    }
    geminiWindow.show();
    geminiWindow.focus();

    const sessionState = await syncGeminiChatSession({ geminiWindow, fallbackUrl: projectUrl });

    return {
      ok: true,
      url: sessionState.chatUrl,
      chatId: sessionState.chatId,
      chrome: null,
    };
  });

  ipcMain.removeHandler('gemini-app:redesign');
  ipcMain.handle('gemini-app:redesign', async (_event, payload) => {
    return enqueueGeminiRedesignTask(async () => {
      const imageUrl = String(payload?.imageUrl || '').trim();
      const prompt = String(payload?.prompt || '').trim();
      const projectUrl = normalizeGeminiProjectUrl(payload?.projectUrl || GEMINI_APP_URL);
      const timeoutMs = Math.max(60_000, Number(payload?.timeoutMs || 300_000));
      if (!imageUrl) {
        throw new Error('Thiếu ảnh nguồn để gửi Gemini App.');
      }
      if (!prompt) {
        throw new Error('Thiếu prompt để gửi Gemini App.');
      }

      const sourceDataUrl = await resolveSourceImageDataUrl(imageUrl);
      const sourceNativeImage = nativeImage.createFromDataURL(sourceDataUrl);
      if (sourceNativeImage.isEmpty()) {
        throw new Error('Không thể đọc ảnh nguồn để copy qua clipboard.');
      }

      const sourcePng = sourceNativeImage.toPNG();
      const sourceHash = hashBuffer(sourcePng);

      const persisted = await loadGeminiChatSession();
      const requestedChatId = extractGeminiChatId(projectUrl);
      const targetChatUrl = requestedChatId
        ? projectUrl
        : (persisted?.chatUrl || projectUrl || GEMINI_APP_URL);

      const geminiWindow = await ensureGeminiAppWindow();
      if (geminiWindow.webContents.getURL() !== targetChatUrl) {
        await geminiWindow.loadURL(targetChatUrl);
      }

      clipboard.clear();
      await autoPasteAndSubmitToGemini(geminiWindow, {
        prompt,
        sourceNativeImage,
      });
      const result = await waitForGeminiOutputImage({ sourceHash, timeoutMs, geminiWindow });
      const syncedSession = await syncGeminiChatSession({ geminiWindow, fallbackUrl: targetChatUrl });
      return {
        ...result,
        payload: {
          chatId: syncedSession.chatId,
          chatUrl: syncedSession.chatUrl,
          accountFingerprint: syncedSession.accountFingerprint,
          generatedAt: new Date().toISOString(),
        },
      };
    });
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
  const windowIconPath = app.isPackaged
    ? path.join(__dirname, 'app-dist', 'logo.jpg')
    : path.join(__dirname, 'public', 'logo.jpg');

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    autoHideMenuBar: true,
    icon: windowIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
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
  if (process.platform === 'win32') {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }

  if (IS_LOCAL_MOCKUP_WORKER_PROCESS) {
    if (!HAS_LOCAL_MOCKUP_WORKER_LOCK) {
      app.quit();
      return;
    }
    // The scheduled worker has no renderer window; keep only the queue loop alive.
    startLocalMockupWorker().then(() => {
      void writeLocalMockupWorkerState();
      setInterval(() => { void writeLocalMockupWorkerState(); }, 2000);
      console.log('[LocalMockupWorker] Background worker started', {
        concurrency: process.env.OFFOREST_LOCAL_MOCKUP_CONCURRENCY || '1',
        pollIntervalMs: process.env.OFFOREST_LOCAL_MOCKUP_POLL_MS || '2000',
      });
    }).catch((error) => {
      console.error('[LocalMockupWorker] Failed to start:', error);
      app.quit();
    });
    return;
  }

  ensurePromptsMoiFile().catch((error) => {
    console.error('[PromptsMoi] Failed to initialize file:', error);
  });
  ensureRendererLogFile().catch((error) => {
    console.error('[Logger] Failed to initialize log file:', error);
  });
  registerPromptIpc();
  registerMockupIpc();
  registerAppLogIpc();
  registerGeminiAppIpc();
  ensureBackgroundLocalMockupWorker().catch((error) => {
    console.error('[LocalMockupWorker] Failed to launch background worker:', error);
  });
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

