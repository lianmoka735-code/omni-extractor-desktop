const fs = require('fs');
const path = require('path');

class StorageService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.filePath = path.join(this.dataDir, 'history.json');
    this.maxCount = 100;
    this.init();
  }

  init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([]), 'utf-8');
    }
  }

  getAll() {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const content = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(content || '[]');
    } catch (err) {
      console.error('读取桌面历史记录失败:', err);
      return [];
    }
  }

  save(record) {
    if (!record) return [];
    try {
      let list = this.getAll();
      list = list.filter(item => {
        if (record.id && item.id === record.id) return false;
        if (record.targetUrl && item.targetUrl === record.targetUrl) return false;
        if (record.content && item.content === record.content) return false;
        return true;
      });

      list.unshift({
        ...record,
        id: record.id || `rec_${Date.now()}`,
        savedAt: Date.now()
      });

      if (list.length > this.maxCount) {
        list = list.slice(0, this.maxCount);
      }

      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
      return list;
    } catch (err) {
      console.error('保存历史记录到文件失败:', err);
      return this.getAll();
    }
  }

  remove(id) {
    try {
      let list = this.getAll();
      list = list.filter(item => item.id !== id);
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
      return list;
    } catch (err) {
      console.error('删除历史记录失败:', err);
      return this.getAll();
    }
  }

  clear() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('清空历史记录失败:', err);
      return false;
    }
  }
}

module.exports = new StorageService();
