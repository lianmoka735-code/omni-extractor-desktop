const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.38';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

class MediaParser {
  /**
   * 追踪短链接最终重定向 URL
   */
  async resolveFinalUrl(rawUrl) {
    try {
      const resp = await axios.get(rawUrl, {
        headers: { 'User-Agent': MOBILE_UA },
        maxRedirects: 10,
        validateStatus: (status) => status >= 200 && status < 400,
        timeout: 8000
      });
      // 获取最终地址
      const finalUrl = (resp.request && resp.request.res && resp.request.res.responseUrl) 
        || (resp.request && resp.request._currentUrl)
        || rawUrl;
      return { finalUrl, html: resp.data, headers: resp.headers };
    } catch (err) {
      if (err.response && err.response.headers && err.response.headers.location) {
        return { finalUrl: err.response.headers.location, html: '', headers: err.response.headers };
      }
      return { finalUrl: rawUrl, html: '', headers: {} };
    }
  }

  /**
   * 核心分发解析器
   */
  async parse(targetUrl) {
    // 1. 获取重定向后的真实 URL 与初始页面内容
    const { finalUrl, html: initialHtml } = await this.resolveFinalUrl(targetUrl);
    const parsed = new URL(finalUrl);
    const host = parsed.hostname.toLowerCase();

    // 2. 根据域名特征分发到专用解析逻辑
    if (host.includes('douyin.com') || host.includes('iesdouyin.com')) {
      return await this.parseDouyin(finalUrl, initialHtml);
    } else if (host.includes('kuaishou.com') || host.includes('kwai.com')) {
      return await this.parseKuaishou(finalUrl, initialHtml);
    } else if (host.includes('xiaohongshu.com') || host.includes('xhslink.com')) {
      return await this.parseXiaohongshu(finalUrl, initialHtml);
    } else if (host.includes('bilibili.com') || host.includes('b23.tv')) {
      return await this.parseBilibili(finalUrl, initialHtml);
    } else if (host.includes('weibo.com') || host.includes('weibo.cn')) {
      return await this.parseWeibo(finalUrl, initialHtml);
    }

    // 3. 通用 HTML5 与 OpenGraph 媒体提取
    return await this.parseGenericWeb(finalUrl, initialHtml);
  }

  /**
   * 抖音 (Douyin) 解析
   */
  async parseDouyin(url, htmlContent) {
    let html = htmlContent;
    if (!html || typeof html !== 'string' || !html.includes('RENDER_DATA')) {
      // 再次用手机端 UA 请求一次分享页
      try {
        const resp = await axios.get(url, {
          headers: {
            'User-Agent': MOBILE_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://www.douyin.com/'
          },
          timeout: 8000
        });
        html = resp.data;
      } catch (e) {
        console.warn('获取抖音页面重试失败:', e.message);
      }
    }

    // 提取数字 ID (视频 item_id)
    const idMatch = url.match(/video\/(\d+)/) || url.match(/modal_id=(\d+)/) || (html && html.match(/"aweme_id":"(\d+)"/));
    const videoId = idMatch ? idMatch[1] : null;

    let title = '抖音短视频';
    let author = '';
    let cover = '';
    let videoUrl = '';
    let musicUrl = '';
    let images = [];

    // 策略 A: 尝试从页面内置的 JSON 数据解析 (RENDER_DATA 或 _ROUTER_DATA)
    if (html) {
      try {
        // 匹配 RENDER_DATA
        const renderMatch = html.match(/<script id="RENDER_DATA" type="application\/json">([\s\S]*?)<\/script>/);
        if (renderMatch && renderMatch[1]) {
          const rawJson = decodeURIComponent(renderMatch[1]);
          const data = JSON.parse(rawJson);
          // 深度查找视频或图集对象
          const aweme = this.findKeyInObject(data, 'awemeDetail') || this.findKeyInObject(data, 'aweme_detail') || this.findKeyInObject(data, 'aweme');
          if (aweme) {
            title = aweme.desc || title;
            author = (aweme.author && aweme.author.nickname) || author;
            cover = (aweme.video && aweme.video.cover && aweme.video.cover.url_list && aweme.video.cover.url_list[0]) || '';
            
            // 视频直链
            const playAddr = aweme.video && aweme.video.play_addr && aweme.video.play_addr.url_list;
            if (playAddr && playAddr.length > 0) {
              // 替换 playwm 为 play 获取无水印
              videoUrl = playAddr[0].replace('playwm', 'play');
            }

            // 图集
            if (aweme.images && Array.isArray(aweme.images)) {
              images = aweme.images.map(img => (img.url_list && img.url_list[0]) || '').filter(Boolean);
            }

            // 音频
            if (aweme.music && aweme.music.play_url && aweme.music.play_url.url_list) {
              musicUrl = aweme.music.play_url.url_list[0];
            }
          }
        }

        // 匹配 _ROUTER_DATA
        if (!videoUrl && !images.length) {
          const routerMatch = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});/);
          if (routerMatch && routerMatch[1]) {
            const data = JSON.parse(routerMatch[1]);
            const item = this.findKeyInObject(data, 'item_list') || this.findKeyInObject(data, 'aweme_detail');
            const aweme = Array.isArray(item) ? item[0] : item;
            if (aweme) {
              title = aweme.desc || title;
              author = (aweme.author && aweme.author.nickname) || author;
              cover = (aweme.video && aweme.video.cover && aweme.video.cover.url_list && aweme.video.cover.url_list[0]) || cover;
              const playAddr = aweme.video && aweme.video.play_addr && aweme.video.play_addr.url_list;
              if (playAddr && playAddr.length > 0) {
                videoUrl = playAddr[0].replace('playwm', 'play');
              }
              if (aweme.images && Array.isArray(aweme.images)) {
                images = aweme.images.map(img => (img.url_list && img.url_list[0]) || '').filter(Boolean);
              }
            }
          }
        }
      } catch (e) {
        console.warn('解析页面内嵌 JSON 异常:', e.message);
      }
    }

    // 策略 B: 若提取到了 videoId 但未获取到视频直链，调用移动端公开接口兜底
    if (videoId && (!videoUrl && !images.length)) {
      try {
        const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`;
        const apiResp = await axios.get(apiUrl, {
          headers: { 'User-Agent': MOBILE_UA },
          timeout: 6000
        });
        if (apiResp.data && apiResp.data.item_list && apiResp.data.item_list[0]) {
          const item = apiResp.data.item_list[0];
          title = item.desc || title;
          author = (item.author && item.author.nickname) || author;
          cover = (item.video && item.video.cover && item.video.cover.url_list && item.video.cover.url_list[0]) || cover;
          const playAddr = item.video && item.video.play_addr && item.video.play_addr.url_list;
          if (playAddr && playAddr.length > 0) {
            videoUrl = playAddr[0].replace('playwm', 'play');
          }
          if (item.images && Array.isArray(item.images)) {
            images = item.images.map(img => (img.url_list && img.url_list[0]) || '').filter(Boolean);
          }
          if (item.music && item.music.play_url && item.music.play_url.url_list) {
            musicUrl = item.music.play_url.url_list[0];
          }
        }
      } catch (apiErr) {
        console.warn('调用公开 iteminfo 接口异常:', apiErr.message);
      }
    }

    // 策略 C: 从 HTML 标签中备用提取
    if (!title || title === '抖音短视频') {
      const $ = cheerio.load(html || '');
      title = $('title').text().replace(/[-_] 抖音.*/, '').trim() || $('meta[name="description"]').attr('content') || title;
      if (!cover) cover = $('meta[property="og:image"]').attr('content') || '';
    }

    return {
      platform: '抖音',
      type: images.length > 0 ? 'image_album' : 'video',
      title: title.trim(),
      author: author.trim(),
      cover: this.fixProtocol(cover),
      videoUrl: this.fixProtocol(videoUrl),
      musicUrl: this.fixProtocol(musicUrl),
      images: images.map(img => this.fixProtocol(img)),
      targetUrl: url,
      domain: 'douyin.com'
    };
  }

  /**
   * 快手 (Kuaishou) 解析
   */
  async parseKuaishou(url, initialHtml) {
    let html = initialHtml;
    if (!html || typeof html !== 'string') {
      const resp = await axios.get(url, { headers: { 'User-Agent': MOBILE_UA }, timeout: 8000 });
      html = resp.data;
    }

    let title = '快手短视频';
    let author = '';
    let cover = '';
    let videoUrl = '';
    let images = [];

    try {
      const match = html.match(/window\.INIT_STATE\s*=\s*(\{[\s\S]*?\});/);
      if (match && match[1]) {
        const data = JSON.parse(match[1]);
        const photo = this.findKeyInObject(data, 'photo') || {};
        title = photo.caption || title;
        author = photo.userName || author;
        cover = (photo.coverUrls && photo.coverUrls[0] && photo.coverUrls[0].url) || '';
        videoUrl = (photo.mainMvUrls && photo.mainMvUrls[0] && photo.mainMvUrls[0].url) || '';
        if (!videoUrl && photo.manifest && photo.manifest.adaptationSet) {
          const rep = photo.manifest.adaptationSet[0]?.representation?.[0];
          if (rep && rep.url) videoUrl = rep.url;
        }
      }
    } catch (e) {
      console.warn('快手 INIT_STATE 解析失败', e);
    }

    if (!videoUrl) {
      const $ = cheerio.load(html);
      title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || title;
      cover = $('meta[property="og:image"]').attr('content') || cover;
      videoUrl = $('video').attr('src') || $('meta[property="og:video:url"]').attr('content') || '';
    }

    return {
      platform: '快手',
      type: images.length > 0 ? 'image_album' : 'video',
      title: title.trim(),
      author: author.trim(),
      cover: this.fixProtocol(cover),
      videoUrl: this.fixProtocol(videoUrl),
      images: images.map(img => this.fixProtocol(img)),
      targetUrl: url,
      domain: 'kuaishou.com'
    };
  }

  /**
   * 小红书 (Xiaohongshu) 解析
   */
  async parseXiaohongshu(url, initialHtml) {
    let html = initialHtml;
    if (!html || typeof html !== 'string') {
      const resp = await axios.get(url, { headers: { 'User-Agent': MOBILE_UA }, timeout: 8000 });
      html = resp.data;
    }

    let title = '小红书笔记';
    let author = '';
    let cover = '';
    let videoUrl = '';
    let images = [];

    try {
      const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})<\/script>/);
      if (match && match[1]) {
        const cleaned = match[1].replace(/undefined/g, 'null');
        const data = JSON.parse(cleaned);
        const note = this.findKeyInObject(data, 'note') || this.findKeyInObject(data, 'noteData');
        if (note) {
          title = note.title || note.desc || title;
          author = (note.user && (note.user.nickname || note.user.name)) || author;
          cover = (note.imageList && note.imageList[0] && (note.imageList[0].urlDefault || note.imageList[0].url)) || '';
          
          if (note.video && note.video.media && note.video.media.stream) {
            const h264 = note.video.media.stream.h264;
            if (h264 && h264.length > 0) {
              videoUrl = h264[0].masterUrl || '';
            }
          }

          if (note.imageList && Array.isArray(note.imageList)) {
            images = note.imageList.map(img => img.urlDefault || img.url).filter(Boolean);
          }
        }
      }
    } catch (e) {
      console.warn('小红书 __INITIAL_STATE__ 解析失败', e);
    }

    if (!videoUrl && !images.length) {
      const $ = cheerio.load(html);
      title = $('meta[name="og:title"]').attr('content') || $('title').text().trim() || title;
      cover = $('meta[name="og:image"]').attr('content') || cover;
      videoUrl = $('video').attr('src') || '';
    }

    return {
      platform: '小红书',
      type: videoUrl ? 'video' : 'image_album',
      title: title.trim(),
      author: author.trim(),
      cover: this.fixProtocol(cover),
      videoUrl: this.fixProtocol(videoUrl),
      images: images.map(img => this.fixProtocol(img)),
      targetUrl: url,
      domain: 'xiaohongshu.com'
    };
  }

  /**
   * 哔哩哔哩 (Bilibili) 简易提取
   */
  async parseBilibili(url, initialHtml) {
    let html = initialHtml;
    if (!html || typeof html !== 'string') {
      const resp = await axios.get(url, { headers: { 'User-Agent': DESKTOP_UA }, timeout: 8000 });
      html = resp.data;
    }

    const $ = cheerio.load(html);
    const title = $('h1.video-title').text().trim() || $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    const cover = $('meta[property="og:image"]').attr('content') || '';
    const author = $('.up-name').text().trim() || $('meta[name="author"]').attr('content') || '';
    const desc = $('meta[property="og:description"]').attr('content') || $('.desc-info-text').text().trim() || '';

    return {
      platform: '哔哩哔哩',
      type: 'video',
      title: title.replace(/_哔哩哔哩_bilibili.*/, '').trim(),
      author,
      cover: this.fixProtocol(cover),
      videoUrl: '', // B站有防盗链，提供浏览器打开与封面提取
      description: desc,
      targetUrl: url,
      domain: 'bilibili.com'
    };
  }

  /**
   * 微博 (Weibo) 视频与图文提取
   */
  async parseWeibo(url, initialHtml) {
    let html = initialHtml;
    if (!html || typeof html !== 'string') {
      const resp = await axios.get(url, { headers: { 'User-Agent': MOBILE_UA }, timeout: 8000 });
      html = resp.data;
    }

    const $ = cheerio.load(html);
    let title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || '微博内容';
    let cover = $('meta[property="og:image"]').attr('content') || '';
    let videoUrl = $('video').attr('src') || $('meta[property="og:video:url"]').attr('content') || '';

    // 尝试正则匹配视频 mp4 直链
    if (!videoUrl && html) {
      const mp4Match = html.match(/https?:\\\/\\\/[^\s"']+\.mp4/gi) || html.match(/https?:\/\/[^\s"']+\.mp4/gi);
      if (mp4Match && mp4Match.length > 0) {
        videoUrl = mp4Match[0].replace(/\\/g, '');
      }
    }

    return {
      platform: '微博',
      type: videoUrl ? 'video' : 'image_album',
      title: title.slice(0, 100).trim(),
      author: '',
      cover: this.fixProtocol(cover),
      videoUrl: this.fixProtocol(videoUrl),
      images: [],
      targetUrl: url,
      domain: 'weibo.com'
    };
  }

  /**
   * 通用网页提取
   */
  async parseGenericWeb(url, initialHtml) {
    let html = initialHtml;
    if (!html || typeof html !== 'string') {
      const resp = await axios.get(url, {
        headers: { 'User-Agent': DESKTOP_UA },
        timeout: 8000
      });
      html = resp.data;
    }

    const $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      '通用网页内容';

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('p').first().text().trim().slice(0, 200) ||
      '';

    let cover =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      '';

    if (cover && !cover.startsWith('http')) {
      cover = new URL(cover, url).href;
    }

    // 查找视频
    let videoUrl = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:url"]').attr('content') || '';
    if (!videoUrl) {
      $('video').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !videoUrl) videoUrl = src;
        $(el).find('source').each((__, s) => {
          const sSrc = $(s).attr('src');
          if (sSrc && !videoUrl) videoUrl = sSrc;
        });
      });
    }
    if (videoUrl && !videoUrl.startsWith('http')) {
      videoUrl = new URL(videoUrl, url).href;
    }

    // 查找音频
    let musicUrl = $('audio').attr('src') || '';
    if (musicUrl && !musicUrl.startsWith('http')) {
      musicUrl = new URL(musicUrl, url).href;
    }

    // 收集图片集 (高分辨率 img)
    const images = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.startsWith('data:') && !src.includes('avatar') && !src.includes('logo')) {
        const full = src.startsWith('http') ? src : new URL(src, url).href;
        if (!images.includes(full)) images.push(full);
      }
    });

    if (!cover && images.length > 0) {
      cover = images[0];
    }

    return {
      platform: '网页媒体',
      type: videoUrl ? 'video' : (images.length > 0 ? 'image_album' : 'web'),
      title: title.trim(),
      author: $('meta[name="author"]').attr('content') || '',
      cover: this.fixProtocol(cover),
      videoUrl: this.fixProtocol(videoUrl),
      musicUrl: this.fixProtocol(musicUrl),
      images: images.slice(0, 20).map(img => this.fixProtocol(img)),
      description: description.trim(),
      targetUrl: url,
      domain: new URL(url).hostname
    };
  }

  /**
   * 递归在对象中查找特定 key
   */
  findKeyInObject(obj, targetKey) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj[targetKey] !== undefined) return obj[targetKey];
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        const found = this.findKeyInObject(obj[key], targetKey);
        if (found) return found;
      }
    }
    return null;
  }

  fixProtocol(u) {
    if (!u || typeof u !== 'string') return '';
    if (u.startsWith('//')) return 'https:' + u;
    return u;
  }
}

module.exports = new MediaParser();
