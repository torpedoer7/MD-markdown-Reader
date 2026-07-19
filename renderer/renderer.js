// —— 渲染进程入口 ——

import { renderMarkdown, setFocusMode, updateWordCount } from './reader.js';
import { initEditor, getEditorContent, setEditorContent, destroyEditor, setAutoSaveCallback, setDirtyCallback, switchEditorTheme, openSearch } from './editor.js';
import { extractFileName, countWords, escapeHtml } from './utils.js';

// ===========================
// 全局状态
// ===========================

let tabs = [];
let activeTabId = null;
let isFocusMode = false;
// 编辑器当前对应的标签页 id（自动保存按此定位，避免切换标签后写错文件）
let editorTabId = null;

// ===========================
// Tab 管理
// ===========================

function createTab(filePath, source) {
  const id = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  const title = extractFileName(filePath);
  const tab = { id, filePath: filePath || '', title, source: source || '', mode: 'reading', dirty: false };
  tabs.push(tab);
  return tab;
}

function closeTab(tabId) {
  if (tabs.length <= 1) {
    const tab = tabs[0];
    if (tab.dirty) {
      const confirmed = confirm(`"${tab.title}" 有未保存的修改，确定关闭吗？`);
      if (!confirmed) return;
    }
    tab.filePath = '';
    tab.title = '未命名';
    tab.source = '';
    tab.mode = 'reading';
    tab.dirty = false;
    // 直接恢复清空后的标签；走 switchTab 会把编辑器里的旧内容重新快照回来
    if (tabId === activeTabId) restoreTab(tab);
    renderTabBar();
    return;
  }

  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  const tab = tabs[idx];

  if (tab.dirty) {
    const confirmed = confirm(`"${tab.title}" 有未保存的修改，确定关闭吗？`);
    if (!confirmed) return;
  }

  tabs.splice(idx, 1);
  if (tabId === activeTabId) {
    const newIdx = Math.min(idx, tabs.length - 1);
    switchTab(tabs[newIdx].id);
  }
  renderTabBar();
}

function switchTab(tabId) {
  if (activeTabId) {
    const currentTab = getTab(activeTabId);
    if (currentTab) {
      currentTab.source = getCurrentSource();
      currentTab.mode = getCurrentMode();
    }
  }

  activeTabId = tabId;
  const tab = getTab(tabId);
  if (!tab) return;

  restoreTab(tab);
  renderTabBar();
  updateWordCount(tab.source);
  updateStatusBar();
}

function getTab(tabId) { return tabs.find(t => t.id === tabId); }
function getActiveTab() { return getTab(activeTabId); }

function getCurrentSource() {
  if (getCurrentMode() === 'editing') return getEditorContent();
  const tab = getActiveTab();
  return tab ? tab.source : '';
}

function getCurrentMode() {
  return document.getElementById('editing-pane').classList.contains('active') ? 'editing' : 'reading';
}

function restoreTab(tab) {
  switchModeInternal(tab.mode);
  if (tab.mode === 'editing') {
    editorTabId = tab.id;
    initEditor(tab.source, tab.id);
  } else {
    const baseDir = tab.filePath ? tab.filePath.replace(/[/\\][^/\\]*$/, '') : '';
    renderMarkdown(tab.source, baseDir);
  }
  document.getElementById('toolbar-filename').textContent = tab.title;
  updateWordCount(tab.source);
}

// ===========================
// Tab 栏渲染
// ===========================

function renderTabBar() {
  const list = document.getElementById('tab-list');
  list.innerHTML = '';

  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item' + (tab.id === activeTabId ? ' active' : '');
    item.title = tab.filePath || tab.title;
    item.onclick = () => switchTab(tab.id);

    if (tab.dirty) {
      const dirty = document.createElement('span');
      dirty.className = 'tab-dirty';
      dirty.textContent = '●';
      item.appendChild(dirty);
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;
    item.appendChild(title);

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };
    item.appendChild(close);

    list.appendChild(item);
  });
}

// ===========================
// 模式切换
// ===========================

function switchModeInternal(mode) {
  const readingPane = document.getElementById('reading-pane');
  const editingPane = document.getElementById('editing-pane');
  const toggleBtn = document.getElementById('btn-toggle-mode');

  if (mode === 'editing') {
    readingPane.classList.remove('active');
    editingPane.classList.add('active');
    toggleBtn.textContent = '阅读';
  } else {
    destroyEditor();
    editorTabId = null;
    editingPane.classList.remove('active');
    readingPane.classList.add('active');
    toggleBtn.textContent = '编辑';
  }
  updateStatusBar();
}

function toggleMode() {
  const currentMode = getCurrentMode();
  const newMode = currentMode === 'reading' ? 'editing' : 'reading';
  const tab = getActiveTab();
  if (tab) {
    tab.source = getCurrentSource();
    tab.mode = newMode;
  }

  if (newMode === 'editing') {
    switchModeInternal('editing');
    editorTabId = tab ? tab.id : null;
    initEditor(tab ? tab.source : '', editorTabId);
  } else {
    switchModeInternal('reading');
    if (tab) {
      const baseDir = tab.filePath ? tab.filePath.replace(/[/\\][^/\\]*$/, '') : '';
      renderMarkdown(tab.source, baseDir);
    }
  }
  updateWordCount(tab ? tab.source : '');
  updateStatusBar();
}

// ===========================
// 文件操作
// ===========================

function openFileFromMain(data) {
  const { filePath, content } = data;
  let targetTab = null;
  const activeTab = getActiveTab();
  if (activeTab && !activeTab.filePath && !activeTab.source && !activeTab.dirty) {
    targetTab = activeTab;
  }

  if (targetTab) {
    targetTab.filePath = filePath;
    targetTab.title = extractFileName(filePath);
    targetTab.source = content;
    targetTab.mode = 'reading';
    targetTab.dirty = false;
    switchTab(targetTab.id);
  } else {
    const newTab = createTab(filePath, content);
    switchTab(newTab.id);
  }
}

function onAutoSave(source) {
  // 按编辑器所属标签页定位，防止防抖期间切换标签后写入错误文件
  const tab = getTab(editorTabId);
  if (!tab || !tab.filePath) return;
  try {
    window.electronAPI.saveFile(tab.filePath, source).then(result => {
      if (result.success) {
        tab.source = source;
        // 防抖快照保存期间用户可能继续输入：内容已变化则保持未保存标记
        const current = tab.id === editorTabId ? getEditorContent() : tab.source;
        if (current === source) tab.dirty = false;
        renderTabBar();
      }
    });
  } catch (e) { /* 环境不支持 IPC */ }
}

function saveCurrentFile() {
  const tab = getActiveTab();
  if (!tab || !tab.filePath) return;
  const source = getCurrentSource();
  window.electronAPI.saveFile(tab.filePath, source).then(result => {
    if (result.success) {
      tab.source = source;
      tab.dirty = false;
      renderTabBar();
    } else {
      alert('保存失败: ' + (result.error || '未知错误'));
    }
  });
}

async function exportPDF() {
  const tab = getActiveTab();
  if (!tab) return;
  const source = getCurrentSource();
  const baseDir = tab.filePath ? tab.filePath.replace(/[/\\][^/\\]*$/, '') : '';

  // 导出前总是用最新内容重新渲染，避免编辑模式下导出陈旧/空的 HTML
  renderMarkdown(source, baseDir);

  const html = document.getElementById('reader-content').innerHTML;
  const printHtml = buildPrintHtml(html, tab.title);

  try {
    const result = await window.electronAPI.exportPDF(printHtml);
    if (result.canceled) return;
    if (!result.success) alert('导出失败: ' + (result.error || '未知错误'));
  } catch (e) {
    alert('导出失败: ' + e.message);
  }
}

function buildPrintHtml(bodyHtml, title) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title><style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:680px;margin:40px auto;padding:0 20px;font-size:16px;line-height:1.8;color:#1a1a1a;background:#fff}h1{font-size:26px;margin:36px 0 18px}h2{font-size:22px;margin:30px 0 14px}h3{font-size:18px;margin:24px 0 10px}p{margin:10px 0}pre{background:#f5f5f5;padding:16px;border-radius:6px;overflow-x:auto;font-size:14px;line-height:1.6}code{font-family:"JetBrains Mono","Fira Code",monospace;font-size:0.9em}pre code{font-size:13px}blockquote{border-left:3px solid #ccc;margin:12px 0;padding:6px 16px;color:#555}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left}th{background:#f5f5f5;font-weight:600}img{max-width:100%}.code-lang,.code-copy-btn{display:none}</style></head><body>${bodyHtml}</body></html>`;
}

// ===========================
// 状态栏
// ===========================

function updateStatusBar() {
  const mode = getCurrentMode();
  document.getElementById('status-info').textContent = mode === 'editing' ? '编辑模式' : '阅读模式';
}

// ===========================
// 分割线拖拽
// ===========================

function initDividerDrag() {
  const divider = document.getElementById('editor-divider');
  let isDragging = false;

  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    divider.style.background = 'var(--accent)';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const editingPane = document.getElementById('editing-pane');
    const rect = editingPane.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0.2), 0.8);
    document.getElementById('editor-left').style.flex = ratio;
    document.getElementById('editor-right').style.flex = 1 - ratio;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) { isDragging = false; divider.style.background = 'var(--border)'; }
  });
}

// ===========================
// 主题切换
// ===========================

function switchTheme() {
  const body = document.body;
  const isDark = body.classList.contains('dark-theme');
  const newIsDark = !isDark;
  const btn = document.getElementById('btn-theme');

  if (newIsDark) {
    body.classList.remove('light-theme');
    body.classList.add('dark-theme');
    btn.textContent = '浅色';
  } else {
    body.classList.remove('dark-theme');
    body.classList.add('light-theme');
    btn.textContent = '深色';
  }

  switchEditorTheme(newIsDark);
  localStorage.setItem('md-reader-theme', newIsDark ? 'dark' : 'light');
}

function loadTheme() {
  const saved = localStorage.getItem('md-reader-theme');
  const isDark = saved !== 'light'; // 默认深色
  const body = document.body;
  const btn = document.getElementById('btn-theme');

  if (isDark) {
    body.classList.add('dark-theme');
    body.classList.remove('light-theme');
    btn.textContent = '浅色';
  } else {
    body.classList.add('light-theme');
    body.classList.remove('dark-theme');
    btn.textContent = '深色';
  }

  switchEditorTheme(isDark);
}

// ===========================
// 拖拽打开文件
// ===========================

function initDropHandler() {
  const overlay = document.getElementById('drop-overlay');
  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) overlay.classList.add('active');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) overlay.classList.remove('active');
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('active');

    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.type === 'text/markdown') {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const content = ev.target.result;
          const tab = createTab(file.path || file.name, content);
          switchTab(tab.id);
        };
        reader.readAsText(file, 'utf-8');
      }
    });
  });
}

// ===========================
// 初始化
// ===========================

function init() {
  // 注册自动保存回调
  setAutoSaveCallback(onAutoSave);
  // 编辑器内容变化时给所属标签页打未保存标记
  setDirtyCallback(() => {
    const tab = getTab(editorTabId);
    if (tab && !tab.dirty) {
      tab.dirty = true;
      renderTabBar();
    }
  });

  // 加载保存的主题
  loadTheme();

  // 工具栏按钮
  document.getElementById('btn-theme').addEventListener('click', switchTheme);
  document.getElementById('btn-toggle-mode').addEventListener('click', toggleMode);
  document.getElementById('btn-export').addEventListener('click', exportPDF);
  document.getElementById('btn-focus').addEventListener('click', () => {
    isFocusMode = setFocusMode(!isFocusMode);
  });
  document.getElementById('btn-new-tab').addEventListener('click', () => {
    const tab = createTab('', '');
    switchTab(tab.id);
  });

  initDividerDrag();
  initDropHandler();

  // 专注模式：鼠标移到顶部恢复
  document.addEventListener('mousemove', (e) => {
    if (isFocusMode && e.clientY < 50) {
      document.getElementById('toolbar').classList.remove('hidden');
      document.getElementById('tab-bar').classList.remove('hidden');
    }
    if (isFocusMode && e.clientY > 80) {
      const toolbar = document.getElementById('toolbar');
      const tabBar = document.getElementById('tab-bar');
      if (!toolbar.matches(':hover') && !tabBar.matches(':hover')) {
        toolbar.classList.add('hidden');
        tabBar.classList.add('hidden');
      }
    }
  });

  // 全局键盘快捷键
  document.addEventListener('keydown', (e) => {
    const isMeta = e.metaKey || e.ctrlKey;
    if (isMeta && e.key === 'e') { e.preventDefault(); toggleMode(); }
    if (isMeta && e.key === 't') { e.preventDefault(); const tab = createTab('', ''); switchTab(tab.id); }
    if (isMeta && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
    if (isMeta && e.shiftKey && e.code === 'BracketRight') {
      e.preventDefault();
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx < tabs.length - 1) switchTab(tabs[idx + 1].id);
    }
    if (isMeta && e.shiftKey && e.code === 'BracketLeft') {
      e.preventDefault();
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx > 0) switchTab(tabs[idx - 1].id);
    }
    if (isMeta && e.key === 's') { e.preventDefault(); saveCurrentFile(); }
    if (isMeta && e.shiftKey && e.key === 'F') { e.preventDefault(); isFocusMode = setFocusMode(!isFocusMode); }
    if (isMeta && e.shiftKey && e.key === 'T') { e.preventDefault(); switchTheme(); }
  });

  // IPC: 接收主进程文件打开事件
  if (window.electronAPI) {
    window.electronAPI.onFileOpen((data) => { openFileFromMain(data); });
    window.electronAPI.onMenuCommand('menu:save', () => saveCurrentFile());
    window.electronAPI.onMenuCommand('menu:export-pdf', () => exportPDF());
    window.electronAPI.onMenuCommand('menu:toggle-mode', () => toggleMode());
    window.electronAPI.onMenuCommand('menu:toggle-focus', () => { isFocusMode = setFocusMode(!isFocusMode); });
    window.electronAPI.onMenuCommand('menu:new-tab', () => { const tab = createTab('', ''); switchTab(tab.id); });
    window.electronAPI.onMenuCommand('menu:close-tab', () => closeTab(activeTabId));
    // 查找/替换仅在编辑模式下生效（CodeMirror 面板同时包含查找与替换）
    const openEditorSearch = () => { if (getCurrentMode() === 'editing') openSearch(); };
    window.electronAPI.onMenuCommand('menu:find', openEditorSearch);
    window.electronAPI.onMenuCommand('menu:replace', openEditorSearch);
  }

  // 初始化空白 Tab
  const firstTab = createTab('', '');
  activeTabId = firstTab.id;
  renderTabBar();
  restoreTab(firstTab);
  updateWordCount('');
  updateStatusBar();
}

// ===========================
// 启动
// ===========================

document.addEventListener('DOMContentLoaded', () => {
  init();
});
