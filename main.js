const { app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const extractorService = require('./src/services/extractorService');
const storageService = require('./src/services/storageService');
const { captureMediaInBackground } = require('./src/services/headlessSniffer');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 850,
    minWidth: 980,
    minHeight: 700,
    title: '万能萃取助手 - 桌面版 (OmniExtractor)',
    backgroundColor: '#0b0f19',
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ================= IPC 通信桥接 =================

// 1. 核心提取动作 (全自动化：常规解析 + 后台静默无头补全)
ipcMain.handle('api:extract', async (event, content) => {
  try {
    const startTime = Date.now();
    const result = await extractorService.processInput(content);

    // 智能后台静默补全：若属于复杂动态流/短视频，且静态 HTTP 未获直链，则在后台无缝静默捕获
    if (result.mode === 'url' && !result.videoUrl && result.targetUrl) {
      console.log('[Main] 自动启动后台静默嗅探补全:', result.targetUrl);
      const bgCaptured = await captureMediaInBackground(result.targetUrl, 9000);
      if (bgCaptured && bgCaptured.videoUrl) {
        result.videoUrl = bgCaptured.videoUrl;
        if (!result.coverImage && bgCaptured.cover) result.coverImage = bgCaptured.cover;
        if ((!result.title || result.title === '提取作品内容') && bgCaptured.title) {
          result.title = bgCaptured.title;
        }
        result.mediaList = result.mediaList || [];
        result.mediaList.unshift({
          type: 'video',
          title: `${result.platform || '视频'} - 无水印高清视频`,
          url: result.videoUrl,
          ext: 'mp4'
        });
      }
    }

    const duration = Date.now() - startTime;
    const record = {
      id: 'ext_' + Date.now(),
      ...result,
      durationMs: duration
    };

    storageService.save(record);

    return {
      code: 200,
      message: '提取成功',
      data: record
    };
  } catch (err) {
    return {
      code: 500,
      message: err.message || '解析提取异常',
      data: null
    };
  }
});

// 2. 本地历史记录管理
ipcMain.handle('api:get-history', async () => {
  return storageService.getAll();
});

ipcMain.handle('api:delete-history', async (event, id) => {
  return storageService.remove(id);
});

ipcMain.handle('api:clear-history', async () => {
  return storageService.clear();
});

// 3. 读取系统剪贴板
ipcMain.handle('api:read-clipboard', async () => {
  return clipboard.readText().trim();
});

// 4. 写入系统剪贴板
ipcMain.handle('api:write-clipboard', async (event, text) => {
  clipboard.writeText(String(text));
  return true;
});

// 5. 调用系统默认浏览器打开 URL
ipcMain.handle('api:open-external', async (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// 6. 下载媒体文件到本地磁盘 (另存为)
ipcMain.handle('api:download-media', async (event, { url, defaultName }) => {
  try {
    if (!mainWindow) return { success: false, message: '窗口不存在' };

    const safeName = (defaultName || 'downloaded_media.mp4').replace(/[\\/:*?"<>|]/g, '_');

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '选择保存位置',
      defaultPath: safeName,
      buttonLabel: '立即下载保存'
    });

    if (canceled || !filePath) {
      return { success: false, message: '已取消保存' };
    }

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve) => {
      writer.on('finish', () => resolve({ success: true, filePath }));
      writer.on('error', (err) => resolve({ success: false, message: err.message }));
    });
  } catch (err) {
    return { success: false, message: err.message || '文件下载失败' };
  }
});

// 7. 批量下载图集到文件夹
ipcMain.handle('api:download-batch-images', async (event, { images, folderTitle }) => {
  try {
    if (!mainWindow) return { success: false, message: '窗口不存在' };
    if (!images || !images.length) return { success: false, message: '没有可下载的图片' };

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片批量保存的目标文件夹',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '保存到此文件夹'
    });

    if (canceled || !filePaths || !filePaths.length) {
      return { success: false, message: '已取消' };
    }

    const baseDir = filePaths[0];
    const safeSub = (folderTitle || '图集_' + Date.now()).slice(0, 30).replace(/[\\/:*?"<>|]/g, '_');
    const targetDir = path.join(baseDir, safeSub);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let successCount = 0;
    for (let i = 0; i < images.length; i++) {
      const imgUrl = images[i];
      try {
        const resp = await axios({
          method: 'GET',
          url: imgUrl,
          responseType: 'stream',
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36'
          }
        });
        const savePath = path.join(targetDir, `image_${i + 1}.jpg`);
        const writer = fs.createWriteStream(savePath);
        resp.data.pipe(writer);
        await new Promise((res, rej) => {
          writer.on('finish', res);
          writer.on('error', rej);
        });
        successCount++;
      } catch (e) {
        console.warn(`第 ${i + 1} 张图片下载失败:`, e.message);
      }
    }

    shell.openPath(targetDir);

    return {
      success: true,
      total: images.length,
      successCount,
      targetDir
    };
  } catch (err) {
    return { success: false, message: err.message || '批量下载失败' };
  }
});

// 8. 在文件夹中高亮显示已下载的文件
ipcMain.handle('api:show-in-folder', async (event, fullPath) => {
  if (fullPath && fs.existsSync(fullPath)) {
    shell.showItemInFolder(fullPath);
    return true;
  }
  return false;
});
