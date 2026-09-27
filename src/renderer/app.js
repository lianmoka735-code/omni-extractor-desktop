// app.js - 桌面版前端交互控制器 (全自动后台解析 & 一键下载)

document.addEventListener('DOMContentLoaded', () => {
  // DOM 节点绑定
  const mainInput = document.getElementById('main-input');
  const extractBtn = document.getElementById('extract-btn');
  const pasteBtn = document.getElementById('paste-btn');
  const clearBtn = document.getElementById('clear-btn');
  const charCounter = document.getElementById('char-counter');

  // 状态视图
  const emptyState = document.getElementById('empty-state');
  const loadingState = document.getElementById('loading-state');
  const loadingText = document.getElementById('loading-text');
  const resultContainer = document.getElementById('result-container');

  // 结果节点
  const resPlatformBadge = document.getElementById('res-platform-badge');
  const resultDuration = document.getElementById('result-duration');
  const copyAllBtn = document.getElementById('copy-all-btn');
  const openBrowserBtn = document.getElementById('open-browser-btn');

  const resTitle = document.getElementById('res-title');
  const resAuthor = document.getElementById('res-author');
  const resSite = document.getElementById('res-site');
  const resDomain = document.getElementById('res-domain');

  // 视频卡片节点
  const videoCard = document.getElementById('video-card');
  const videoStatusTag = document.getElementById('video-status-tag');
  const resVideoPlayer = document.getElementById('res-video-player');
  const downloadVideoBtn = document.getElementById('download-video-btn');
  const copyVideoUrlBtn = document.getElementById('copy-video-url-btn');

  // 图集卡片节点
  const albumCard = document.getElementById('album-card');
  const albumCount = document.getElementById('album-count');
  const albumGrid = document.getElementById('album-grid');
  const downloadAllImagesBtn = document.getElementById('download-all-images-btn');

  // 音频卡片节点
  const musicCard = document.getElementById('music-card');
  const resAudioPlayer = document.getElementById('res-audio-player');
  const downloadMusicBtn = document.getElementById('download-music-btn');

  // 封面卡片节点
  const coverCard = document.getElementById('cover-card');
  const resCoverImg = document.getElementById('res-cover-img');
  const copyCoverBtn = document.getElementById('copy-cover-btn');
  const saveCoverBtn = document.getElementById('save-cover-btn');

  // 历史记录抽屉
  const toggleHistoryBtn = document.getElementById('toggle-history-btn');
  const historyDrawer = document.getElementById('history-drawer');
  const drawerOverlay = document.getElementById('drawer-overlay');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const clearAllHistoryBtn = document.getElementById('clear-all-history-btn');
  const historyListContainer = document.getElementById('history-list');
  const historyCountBadge = document.getElementById('history-count');

  const toastEl = document.getElementById('toast');

  let currentResult = null;

  // ================= 辅助工具函数 =================

  function showToast(message, duration = 3000) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, duration);
  }

  function updateCharCount() {
    const len = mainInput.value.length;
    charCounter.textContent = `${len} 字符`;
  }

  // ================= 核心提取逻辑 =================

  async function handleExtract() {
    const text = mainInput.value.trim();
    if (!text) {
      showToast('请先输入或粘贴待提取的链接或分享文案');
      mainInput.focus();
      return;
    }

    if (resVideoPlayer) resVideoPlayer.pause();
    if (resAudioPlayer) resAudioPlayer.pause();

    emptyState.classList.add('hidden');
    resultContainer.classList.add('hidden');
    loadingState.classList.remove('hidden');
    loadingText.textContent = '系统正在后台静默抓取并提取无水印视频直链，请稍候...';
    extractBtn.disabled = true;

    try {
      const res = await window.desktopAPI.extract(text);
      if (res && res.code === 200 && res.data) {
        currentResult = res.data;
        renderResult(currentResult);
        refreshHistoryBadge();
        showToast('🎉 提取完成！请直接点击下方按钮下载');
      } else {
        showToast(res.message || '提取失败，请检查链接或网络');
        emptyState.classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
      showToast('解析过程发生异常: ' + (err.message || '未知错误'));
      emptyState.classList.remove('hidden');
    } finally {
      loadingState.classList.add('hidden');
      extractBtn.disabled = false;
    }
  }

  function renderResult(data) {
    resultContainer.classList.remove('hidden');
    resultDuration.textContent = `耗时: ${data.durationMs || 0}ms`;

    // 平台徽章与作者
    resPlatformBadge.textContent = `平台: ${data.platform || '通用媒体'}`;
    resTitle.textContent = data.title || '提取媒体内容';
    resAuthor.textContent = data.author ? `作者: ${data.author}` : (data.platform ? `来源: ${data.platform}` : '无作者');
    resSite.textContent = data.platform || '网络媒体';
    resDomain.textContent = `域名: ${data.domain || '外网直链'}`;

    // 1. 核心视频专区
    if (data.videoUrl) {
      videoCard.classList.remove('hidden');
      videoStatusTag.textContent = '无水印直链已就绪';
      videoStatusTag.style.color = '#34d399';

      resVideoPlayer.src = data.videoUrl;
      resVideoPlayer.load();
    } else {
      videoCard.classList.add('hidden');
      resVideoPlayer.removeAttribute('src');
    }

    // 2. 图集处理
    if (data.images && data.images.length > 0) {
      albumCard.classList.remove('hidden');
      albumCount.textContent = data.images.length;
      albumGrid.innerHTML = '';

      data.images.forEach((imgUrl, index) => {
        const item = document.createElement('div');
        item.className = 'album-item';
        item.innerHTML = `
          <img src="${imgUrl}" loading="lazy" alt="图集 ${index + 1}" />
          <div class="album-item-overlay">
            <button class="btn-dl-single" data-url="${imgUrl}" data-index="${index + 1}">⬇️ 下载</button>
          </div>
        `;
        albumGrid.appendChild(item);
      });

      albumGrid.querySelectorAll('.btn-dl-single').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const url = e.target.getAttribute('data-url');
          const idx = e.target.getAttribute('data-index');
          showToast('请选择保存位置...');
          const dl = await window.desktopAPI.downloadMedia({
            url,
            defaultName: `${(data.title || '图片').slice(0, 15)}_${idx}.jpg`
          });
          if (dl.success) {
            showToast(`图片 ${idx} 已保存成功！`);
          }
        });
      });
    } else {
      albumCard.classList.add('hidden');
    }

    // 3. 背景音频处理
    if (data.musicUrl) {
      musicCard.classList.remove('hidden');
      resAudioPlayer.src = data.musicUrl;
      resAudioPlayer.load();
    } else {
      musicCard.classList.add('hidden');
      resAudioPlayer.removeAttribute('src');
    }

    // 4. 封面图处理
    if (data.coverImage) {
      coverCard.classList.remove('hidden');
      resCoverImg.src = data.coverImage;
    } else {
      coverCard.classList.add('hidden');
    }
  }

  // ================= 下载事件监听绑定 =================

  // 1. 下载无水印视频
  downloadVideoBtn.addEventListener('click', async () => {
    if (!currentResult || !currentResult.videoUrl) {
      showToast('未检测到视频下载地址');
      return;
    }
    showToast('正在打开保存文件窗口，请选择保存位置...');
    const safeTitle = (currentResult.title || '视频').slice(0, 25).trim();
    const res = await window.desktopAPI.downloadMedia({
      url: currentResult.videoUrl,
      defaultName: `${safeTitle}_无水印.mp4`
    });

    if (res.success) {
      showToast(`🎉 视频已成功下载至本地电脑！`, 4000);
      window.desktopAPI.showInFolder(res.filePath);
    } else if (res.message !== '已取消保存') {
      showToast(`下载失败: ${res.message}`);
    }
  });

  // 2. 复制视频直链
  copyVideoUrlBtn.addEventListener('click', () => {
    if (currentResult && currentResult.videoUrl) {
      window.desktopAPI.writeClipboard(currentResult.videoUrl);
      showToast('已复制无水印视频直链');
    }
  });

  // 3. 一键批量下载所有图集图片
  downloadAllImagesBtn.addEventListener('click', async () => {
    if (!currentResult || !currentResult.images || !currentResult.images.length) return;
    showToast('请选择图集保存的电脑文件夹...');
    downloadAllImagesBtn.disabled = true;
    downloadAllImagesBtn.textContent = '正在批量下载中...';

    const res = await window.desktopAPI.downloadBatchImages({
      images: currentResult.images,
      folderTitle: currentResult.title || '图集'
    });

    downloadAllImagesBtn.disabled = false;
    downloadAllImagesBtn.innerHTML = '<span class="icon">⬇️</span><span>一键批量下载所有图片到文件夹</span>';

    if (res.success) {
      showToast(`🎉 已成功保存全部 ${res.successCount} 张高清图片！已自动打开文件夹。`, 4000);
    } else if (res.message !== '已取消') {
      showToast(`下载遇到问题: ${res.message}`);
    }
  });

  // 4. 下载背景音频
  downloadMusicBtn.addEventListener('click', async () => {
    if (!currentResult || !currentResult.musicUrl) return;
    showToast('请选择音频保存位置...');
    const res = await window.desktopAPI.downloadMedia({
      url: currentResult.musicUrl,
      defaultName: `${(currentResult.title || '音频').slice(0, 20)}_伴奏.mp3`
    });
    if (res.success) {
      showToast('音频已成功保存到电脑！', 3000);
      window.desktopAPI.showInFolder(res.filePath);
    }
  });

  // 5. 下载封面图
  saveCoverBtn.addEventListener('click', async () => {
    if (!currentResult || !currentResult.coverImage) return;
    showToast('请选择封面保存位置...');
    const res = await window.desktopAPI.downloadMedia({
      url: currentResult.coverImage,
      defaultName: `${(currentResult.title || '封面').slice(0, 20)}_封面.jpg`
    });
    if (res.success) {
      showToast('封面原图已保存到电脑！', 3000);
      window.desktopAPI.showInFolder(res.filePath);
    }
  });

  copyCoverBtn.addEventListener('click', () => {
    if (currentResult && currentResult.coverImage) {
      window.desktopAPI.writeClipboard(currentResult.coverImage);
      showToast('封面直链已复制');
    }
  });

  // 复制文本信息
  copyAllBtn.addEventListener('click', () => {
    if (!currentResult) return;
    let full = `【标题】${currentResult.title || ''}\n`;
    if (currentResult.author) full += `【作者】${currentResult.author}\n`;
    if (currentResult.videoUrl) full += `【无水印视频直链】${currentResult.videoUrl}\n`;
    if (currentResult.musicUrl) full += `【音频直链】${currentResult.musicUrl}\n`;
    if (currentResult.targetUrl) full += `【原网页链接】${currentResult.targetUrl}\n`;
    window.desktopAPI.writeClipboard(full);
    showToast('已复制全部文案与直链！');
  });

  // 浏览器打开原网页
  openBrowserBtn.addEventListener('click', () => {
    if (currentResult && currentResult.targetUrl) {
      window.desktopAPI.openExternal(currentResult.targetUrl);
      showToast('已在系统浏览器中打开原网页');
    }
  });

  // ================= 基础交互绑定 =================

  extractBtn.addEventListener('click', handleExtract);

  pasteBtn.addEventListener('click', async () => {
    const clipText = await window.desktopAPI.readClipboard();
    if (clipText) {
      mainInput.value = clipText;
      updateCharCount();
      showToast('已从剪贴板粘贴');
    } else {
      showToast('剪贴板中没有可粘贴的文本');
    }
  });

  clearBtn.addEventListener('click', () => {
    mainInput.value = '';
    updateCharCount();
    showToast('已清空输入');
  });

  mainInput.addEventListener('input', updateCharCount);

  // 快捷键
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExtract();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      mainInput.value = '';
      updateCharCount();
      showToast('已快捷清空输入');
    }
  });

  // ================= 历史记录抽屉逻辑 =================

  async function refreshHistoryBadge() {
    try {
      const list = await window.desktopAPI.getHistory();
      historyCountBadge.textContent = (list && list.length) || 0;
    } catch (e) {
      console.error(e);
    }
  }

  async function openHistoryDrawer() {
    const list = await window.desktopAPI.getHistory();
    historyListContainer.innerHTML = '';

    if (!list || list.length === 0) {
      historyListContainer.innerHTML = `
        <div style="text-align: center; color: #64748b; margin-top: 80px;">
          <div style="font-size: 36px; margin-bottom: 8px;">📂</div>
          <p>暂无历史解析记录</p>
        </div>
      `;
    } else {
      list.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'history-item';
        const dateStr = new Date(item.savedAt || item.extractedAt).toLocaleString();
        itemEl.innerHTML = `
          <div class="history-item-top">
            <span>🎬 ${item.platform || '媒体资源'}</span>
            <span>${dateStr}</span>
          </div>
          <div class="history-title">${item.title || item.rawPreview || '无标题'}</div>
          <div class="history-desc">${item.targetUrl || item.content || ''}</div>
          <div class="history-btns">
            <button class="mini-btn reuse-btn">再次提取</button>
            <button class="mini-btn copy-item-btn">复制链接</button>
            <button class="mini-btn del-btn" style="color: #f87171;">删除</button>
          </div>
        `;

        itemEl.querySelector('.reuse-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          mainInput.value = item.targetUrl || item.content || item.title;
          updateCharCount();
          closeDrawer();
          handleExtract();
        });

        itemEl.querySelector('.copy-item-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          window.desktopAPI.writeClipboard(item.videoUrl || item.targetUrl || item.content || '');
          showToast('已复制链接');
        });

        itemEl.querySelector('.del-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.desktopAPI.deleteHistory(item.id);
          openHistoryDrawer();
          refreshHistoryBadge();
          showToast('已删除该条记录');
        });

        historyListContainer.appendChild(itemEl);
      });
    }

    historyDrawer.classList.remove('hidden');
    drawerOverlay.classList.remove('hidden');
  }

  function closeDrawer() {
    historyDrawer.classList.add('hidden');
    drawerOverlay.classList.add('hidden');
  }

  toggleHistoryBtn.addEventListener('click', openHistoryDrawer);
  closeDrawerBtn.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  clearAllHistoryBtn.addEventListener('click', async () => {
    if (confirm('确定要清空全部本地历史记录吗？')) {
      await window.desktopAPI.clearHistory();
      openHistoryDrawer();
      refreshHistoryBadge();
      showToast('历史记录已清空');
    }
  });

  updateCharCount();
  refreshHistoryBadge();
});
