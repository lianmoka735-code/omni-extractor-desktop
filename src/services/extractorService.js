const mediaParser = require('./mediaParser');
const { validateUrlForSsrf, extractUrlsFromText, maskSensitiveInfo } = require('./security');

class ExtractorService {
  /**
   * 统一入口：自动识别链接或纯文本并执行智能萃取
   */
  async processInput(content) {
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new Error('请输入有效的分享链接或内容文本');
    }

    const trimmed = content.trim();
    const urls = extractUrlsFromText(trimmed);

    if (urls.length > 0) {
      const primaryUrl = urls[0];

      // SSRF 安全校验
      const validation = await validateUrlForSsrf(primaryUrl);
      if (!validation.valid) {
        throw new Error(`安全拦截: ${validation.reason}`);
      }

      // 调用多平台媒体提取解析引擎
      const mediaResult = await mediaParser.parse(primaryUrl);

      // 智能提取用户分享文本里的真实文案标题
      let realTitle = (mediaResult.title || '').trim();
      const isGenericTitle = !realTitle || 
        realTitle.includes('在抖音记录美好生活') || 
        realTitle.includes('未命名') || 
        realTitle === '抖音短视频' ||
        realTitle === '快手短视频' ||
        realTitle === '通用网页内容';

      if (isGenericTitle) {
        // 从原始文本中提取有效描述文案
        const textWithoutUrl = trimmed
          .replace(/https?:\/\/[^\s\u4e00-\u9fa5+]+/gi, '')
          .replace(/复制此链接.*/g, '')
          .replace(/打开.*搜索/g, '')
          .replace(/^[0-9\.\s\:\/a-zA-Z@]+/, '') // 过滤开头的随机分享码
          .trim();
        if (textWithoutUrl.length > 2) {
          realTitle = textWithoutUrl;
        } else if (!realTitle) {
          realTitle = '提取作品内容';
        }
      }

      // 组装格式化多媒体列表
      const mediaList = [];
      if (mediaResult.videoUrl) {
        mediaList.push({
          type: 'video',
          title: `${mediaResult.platform || '视频'} - 无水印高清视频`,
          url: mediaResult.videoUrl,
          ext: 'mp4'
        });
      }
      if (mediaResult.musicUrl) {
        mediaList.push({
          type: 'audio',
          title: `${mediaResult.platform || '音频'} - 背景音频伴奏`,
          url: mediaResult.musicUrl,
          ext: 'mp3'
        });
      }
      if (mediaResult.cover) {
        mediaList.push({
          type: 'image',
          title: '高清封面原图',
          url: mediaResult.cover,
          ext: 'jpg'
        });
      }

      return {
        mode: 'url',
        urlsDetected: urls,
        platform: mediaResult.platform || '网页媒体',
        title: realTitle,
        author: mediaResult.author || '',
        coverImage: mediaResult.cover || '',
        videoUrl: mediaResult.videoUrl || '',
        musicUrl: mediaResult.musicUrl || '',
        images: mediaResult.images || [],
        mediaList,
        description: mediaResult.description || realTitle,
        targetUrl: mediaResult.targetUrl || primaryUrl,
        domain: mediaResult.domain || '',
        extractedAt: new Date().toISOString()
      };
    } else {
      // 纯文本深度分析模式
      return this.extractTextDetails(trimmed);
    }
  }

  /**
   * 纯文本模式分析
   */
  extractTextDetails(text) {
    const charCount = text.length;
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0).length;
    const masked = maskSensitiveInfo(text);

    return {
      mode: 'text',
      type: 'text_analysis',
      title: text.slice(0, 40) + (text.length > 40 ? '...' : ''),
      content: masked,
      rawPreview: text.slice(0, 300),
      stats: {
        charCount,
        wordCount,
        lineCount: lines,
        hasSensitiveInfo: masked !== text
      },
      extractedAt: new Date().toISOString()
    };
  }
}

module.exports = new ExtractorService();
