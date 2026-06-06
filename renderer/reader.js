// —— 阅读模式 ——

import { marked } from 'marked';
import hljs from 'highlight.js';
import { countWords } from './utils.js';

/**
 * 将 Markdown 源码渲染为 HTML，注入 #reader-content
 */
export function renderMarkdown(source, baseDir) {
  const contentEl = document.getElementById('reader-content');
  if (!source) {
    contentEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 120px;">打开一个 .md 文件开始阅读</p>';
    return;
  }

  const renderer = new marked.Renderer();

  // 自定义图片渲染：解析相对路径
  renderer.image = function (href, title, text) {
    let src = href;
    if (baseDir && href && !href.startsWith('http') && !href.startsWith('/') && !href.startsWith('data:')) {
      src = 'file://' + baseDir + '/' + href;
    }
    const titleAttr = title ? ` title="${title}"` : '';
    const altAttr = text ? ` alt="${text}"` : '';
    return `<img src="${src}"${altAttr}${titleAttr}>`;
  };

  // 自定义代码块渲染
  renderer.code = function (code, language) {
    const langLabel = language ? language.toUpperCase() : '';
    const langAttr = language ? ` class="language-${language}"` : '';

    let highlighted;
    try {
      if (language && hljs.getLanguage(language)) {
        highlighted = hljs.highlight(code, { language }).value;
      } else {
        highlighted = hljs.highlightAuto(code).value;
      }
    } catch (e) {
      highlighted = escapeHtml(code);
    }

    const escapedCode = escapeHtml(code);
    return `<div class="code-block-wrapper">${langLabel ? `<span class="code-lang">${langLabel}</span>` : ''}<button class="code-copy-btn" data-code="${escapedCode}" onclick="copyCodeBlock(this)">复制</button><pre><code${langAttr}>${highlighted}</code></pre></div>`;
  };

  marked.setOptions({ renderer, breaks: true, gfm: true });

  const html = marked.parse(source);
  contentEl.innerHTML = html;

  // 绑定图片错误处理
  contentEl.querySelectorAll('img').forEach(img => {
    img.onerror = function () {
      this.alt = '[图片加载失败]';
      this.style.cssText = 'padding: 20px; border: 1px dashed var(--border); border-radius: 8px; color: var(--text-muted); font-size: 14px; display: block;';
    };
  });
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, char => map[char]);
}

/**
 * 复制代码块，挂载到 window 以便 onclick 调用
 */
window.copyCodeBlock = function (btn) {
  const rawCode = btn.getAttribute('data-code');
  navigator.clipboard.writeText(rawCode).then(() => {
    btn.textContent = '已复制';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = rawCode;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '已复制';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
  });
};

/**
 * 切换专注模式
 */
/**
 * 设置专注模式状态
 * @param {boolean} enter - true 进入专注模式，false 退出
 */
export function setFocusMode(enter) {
  const toolbar = document.getElementById('toolbar');
  const tabBar = document.getElementById('tab-bar');
  if (enter) {
    toolbar.classList.add('hidden');
    tabBar.classList.add('hidden');
  } else {
    toolbar.classList.remove('hidden');
    tabBar.classList.remove('hidden');
  }
  return enter;
}

/**
 * 更新字数显示
 */
export function updateWordCount(source) {
  const count = countWords(source);
  document.getElementById('toolbar-wordcount').textContent = count + ' 字';
}
