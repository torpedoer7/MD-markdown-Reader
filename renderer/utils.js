// —— 工具函数 ——

/**
 * 从文件路径提取文件名
 */
export function extractFileName(filePath) {
  if (!filePath) return '未命名';
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || '未命名';
}

/**
 * HTML 特殊字符转义
 */
export function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, char => map[char]);
}

/**
 * 字数统计：中文按字符数，英文按单词数
 */
export function countWords(source) {
  if (!source) return 0;
  const chineseChars = (source.match(/[一-鿿㐀-䶿]/g) || []).length;
  const englishWords = (source.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
}
