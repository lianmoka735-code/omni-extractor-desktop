const { BrowserWindow } = require('electron');

/**
 * 后台静默无头媒体捕获引擎 (无需用户干预，全自动后台嗅探视频源)
 */
function captureMediaInBackground(targetUrl, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let hasResolved = false;
    let snifferWin = null;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (snifferWin && !snifferWin.isDestroyed()) {
        try {
          snifferWin.destroy();
        } catch (e) {}
      }
      snifferWin = null;
    };

    const safeResolve = (result) => {
      if (hasResolved) return;
      hasResolved = true;
      cleanup();
      resolve(result || {});
    };

    // 超时兜底处理
    timer = setTimeout(() => {
      console.log('[HeadlessSniffer] 静默捕获超时');
      safeResolve({});
    }, timeoutMs);

    try {
      snifferWin = new BrowserWindow({
        show: false, // 彻底静默后台，不弹出任何窗口
        width: 375,
        height: 667,
        webPreferences: {
          offscreen: true,
          webSecurity: false,
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.38';
      snifferWin.webContents.setUserAgent(mobileUA);

      let capturedVideoUrl = null;

      // 实时拦截网络流量，自动嗅探视频媒体源
      snifferWin.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
        const reqUrl = details.url;

        // 识别常见的音视频媒体直链特征
        const isMediaStream = (
          reqUrl.includes('.mp4') || 
          reqUrl.includes('playwm') || 
          reqUrl.includes('/play/') || 
          reqUrl.includes('video/tos/') ||
          reqUrl.includes('.douyinvod.com') ||
          reqUrl.includes('kspvod.com') ||
          reqUrl.includes('sns-video')
        );

        if (isMediaStream && !reqUrl.includes('blob:') && !capturedVideoUrl) {
          // 替换 playwm 为 play 实现无水印
          capturedVideoUrl = reqUrl.replace('playwm', 'play');
          console.log('[HeadlessSniffer] 🎉 后台成功嗅探到无水印视频直链:', capturedVideoUrl.slice(0, 100));
          
          // 立即延迟 200ms 等待 DOM 元数据后返回
          setTimeout(async () => {
            let domInfo = {};
            if (snifferWin && !snifferWin.isDestroyed()) {
              try {
                domInfo = await snifferWin.webContents.executeJavaScript(`
                  (() => {
                    const title = document.querySelector('h1, title, .desc, [class*="desc"]')?.innerText || document.title || '';
                    const author = document.querySelector('[class*="author"], [class*="name"]')?.innerText || '';
                    const poster = document.querySelector('video')?.poster || '';
                    return { title, author, poster };
                  })()
                `).catch(() => ({}));
              } catch (e) {}
            }
            safeResolve({
              videoUrl: capturedVideoUrl,
              title: domInfo.title,
              author: domInfo.author,
              cover: domInfo.poster
            });
          }, 200);
        }

        callback({});
      });

      // 页面加载并注入静默播放器触发脚本
      snifferWin.loadURL(targetUrl, { userAgent: mobileUA }).then(() => {
        if (!snifferWin || snifferWin.isDestroyed()) return;

        // 延迟执行自动播放与 DOM 检查
        setTimeout(async () => {
          if (!snifferWin || snifferWin.isDestroyed()) return;
          try {
            await snifferWin.webContents.executeJavaScript(`
              (() => {
                // 1. 尝试静音自动播放视频触发网络流
                const videos = document.querySelectorAll('video');
                videos.forEach(v => {
                  v.muted = true;
                  v.play().catch(() => {});
                });

                // 2. 模拟点击屏幕播放按钮
                const playBtn = document.querySelector('[class*="play"], .play-btn, svg');
                if (playBtn) playBtn.click();
              })()
            `).catch(() => {});
          } catch (e) {}
        }, 500);

        // 二次重试：3秒后再次尝试触发播放（应对慢加载页面）
        setTimeout(async () => {
          if (!snifferWin || snifferWin.isDestroyed() || hasResolved) return;
          try {
            await snifferWin.webContents.executeJavaScript(`
              (() => {
                const videos = document.querySelectorAll('video');
                videos.forEach(v => { v.muted = true; v.play().catch(() => {}); });
                document.querySelectorAll('[class*="play"], .play-btn, button').forEach(b => b.click());
              })()
            `).catch(() => {});
          } catch (e) {}
        }, 3000);
      }).catch((err) => {
        console.warn('[HeadlessSniffer] 加载链接异常:', err.message);
      });

    } catch (err) {
      console.error('[HeadlessSniffer] 创建无头窗口失败:', err);
      safeResolve({});
    }
  });
}

module.exports = {
  captureMediaInBackground
};
