const dns = require('dns').promises;
const { URL } = require('url');

/**
 * 判断 IP 是否为私有内网/环回地址 (防止 SSRF 漏洞探测)
 */
function isPrivateIp(ip) {
  if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1' || ip === '0.0.0.0') return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  return false;
}

/**
 * 校验目标 URL 是否合规且远离内部局域网
 */
async function validateUrlForSsrf(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: '协议不支持，仅允许 HTTP / HTTPS 网络链接' };
    }

    const hostname = parsed.hostname;
    if (!hostname) {
      return { valid: false, reason: '链接缺少有效域名' };
    }

    if (isPrivateIp(hostname)) {
      return { valid: false, reason: '禁止请求内部局域网或本地地址 (SSRF 安全保护)' };
    }

    try {
      const addresses = await dns.lookup(hostname, { all: true });
      for (const item of addresses) {
        if (isPrivateIp(item.address)) {
          return { valid: false, reason: '目标域名解析为内网保留地址，已被安全策略拦截' };
        }
      }
    } catch (e) {
      return { valid: false, reason: `域名无法解析: ${e.message}` };
    }

    return { valid: true, sanitizedUrl: parsed.href };
  } catch (err) {
    return { valid: false, reason: '无效的 URL 格式' };
  }
}

/**
 * 从文本中提取所有合法的 HTTP(S) 链接
 */
function extractUrlsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const urlRegex = /(https?:\/\/[^\s\u4e00-\u9fa5+]+)/gi;
  const matches = text.match(urlRegex) || [];
  return matches.map(url => url.replace(/[),;，。！？!]+$/, ''));
}

/**
 * 文本脱敏辅助（手机号、邮箱脱敏）
 */
function maskSensitiveInfo(text) {
  if (!text) return '';
  return text
    .replace(/(\d{3})\d{4}(\d{4})/g, '$1****$2')
    .replace(/([a-zA-Z0-9_\.-]+)@([a-zA-Z0-9\.-]+)/g, (match, p1, p2) => {
      const visible = p1.length > 2 ? p1.slice(0, 2) : p1.slice(0, 1);
      return `${visible}***@${p2}`;
    });
}

module.exports = {
  isPrivateIp,
  validateUrlForSsrf,
  extractUrlsFromText,
  maskSensitiveInfo
};
