// —— 编辑模式 ——

import { EditorView, keymap, drawSelection, highlightActiveLine, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { closeBrackets } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { marked } from 'marked';
import hljs from 'highlight.js';

let editorView = null;
let autoSaveTimer = null;
let autoSaveCallback = null;
let dirtyCallback = null;
let editorIsDark = true;
// 编辑器当前服务的标签页 id；切换标签时据此重建编辑器，避免撤销历史/状态跨文件串扰
let editorKey = null;
let previewTimer = null;
// 主题用 Compartment 动态切换，避免重建编辑器丢失撤销历史
const themeCompartment = new Compartment();

export function setAutoSaveCallback(fn) {
  autoSaveCallback = fn;
}

export function setDirtyCallback(fn) {
  dirtyCallback = fn;
}

// 深色编辑器主题
const darkEditorTheme = EditorView.theme({
  '&': { backgroundColor: '#1E1E2E', color: '#CDD6F4' },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Menlo", monospace',
    fontSize: '15px',
    lineHeight: '1.7',
    padding: '16px 0',
  },
  '.cm-gutters': { backgroundColor: '#1E1E2E', color: '#A6ADC8', borderRight: '1px solid #313244' },
  '.cm-activeLineGutter': { backgroundColor: '#313244' },
  '.cm-activeLine': { backgroundColor: 'rgba(250, 179, 135, 0.04)' },
  '.cm-cursor': { borderLeftColor: '#FAB387' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#45475A' },
  '.cm-matchingBracket': { backgroundColor: '#45475A', color: '#FAB387', outline: 'none' },
  '.cm-searchMatch': { backgroundColor: 'rgba(250, 179, 135, 0.3)' },
  '.cm-searchMatch-selected': { backgroundColor: 'rgba(250, 179, 135, 0.5)' },
}, { dark: true });

// 浅色编辑器主题
const lightEditorTheme = EditorView.theme({
  '&': { backgroundColor: '#FFFFFF', color: '#2C2C2C' },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Menlo", monospace',
    fontSize: '15px',
    lineHeight: '1.7',
    padding: '16px 0',
  },
  '.cm-gutters': { backgroundColor: '#F8F8F5', color: '#8B8B80', borderRight: '1px solid #D5D5CF' },
  '.cm-activeLineGutter': { backgroundColor: '#E8E8E2' },
  '.cm-activeLine': { backgroundColor: 'rgba(204, 107, 0, 0.05)' },
  '.cm-cursor': { borderLeftColor: '#CC6B00' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#E8DCC8' },
  '.cm-matchingBracket': { backgroundColor: '#E8DCC8', color: '#CC6B00', outline: 'none' },
  '.cm-searchMatch': { backgroundColor: 'rgba(204, 107, 0, 0.2)' },
  '.cm-searchMatch-selected': { backgroundColor: 'rgba(204, 107, 0, 0.35)' },
}, { dark: false });

function getActiveTheme() {
  return editorIsDark ? darkEditorTheme : lightEditorTheme;
}

/**
 * 切换编辑器主题
 */
export function switchEditorTheme(isDark) {
  editorIsDark = isDark;
  if (!editorView) return;
  // 只重配主题扩展，保留文档与撤销历史
  editorView.dispatch({ effects: themeCompartment.reconfigure(getActiveTheme()) });
}

/**
 * 初始化 CodeMirror 6 编辑器
 * @param {string} initialContent 初始文档
 * @param {string|null} key 所属标签页 id；同一 id 重复调用时保留编辑状态
 */
export function initEditor(initialContent, key = null) {
  if (editorView && key !== null && key === editorKey) return;
  destroyEditor();
  createEditor(initialContent);
  editorKey = key;
  updatePreview(initialContent || '');
}

function createEditor(initialContent) {
  const container = document.getElementById('codemirror-container');

  const extensions = [
    themeCompartment.of(getActiveTheme()),
    lineNumbers(),
    syntaxHighlighting(defaultHighlightStyle),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    closeBrackets(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        onEditorChange();
      }
      updateCursorPosition(update.state);
    }),
  ];

  const state = EditorState.create({
    doc: initialContent || '',
    extensions,
  });

  editorView = new EditorView({ state, parent: container });
}

function onEditorChange() {
  if (!editorView) return;
  const source = editorView.state.doc.toString();
  if (dirtyCallback) dirtyCallback();
  // 预览渲染含语法高亮，开销较大，做防抖
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    updatePreview(source);
  }, 200);
  scheduleAutoSave(source);
}

function updatePreview(source) {
  const previewEl = document.getElementById('preview-content');
  if (!previewEl) return;

  const renderer = new marked.Renderer();
  renderer.code = function (code, language) {
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
    const langAttr = language ? ` class="language-${escapeHtml(language)}"` : '';
    return `<pre><code${langAttr}>${highlighted}</code></pre>`;
  };

  marked.setOptions({ renderer, breaks: true, gfm: true });
  previewEl.innerHTML = marked.parse(source || '');
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, char => map[char]);
}

function scheduleAutoSave(source) {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    if (autoSaveCallback) autoSaveCallback(source);
  }, 3000);
}

function updateCursorPosition(state) {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const el = document.getElementById('status-cursor');
  if (el) el.textContent = `Ln ${line.number}, Col ${pos - line.from + 1}`;
}

export function getEditorContent() {
  return editorView ? editorView.state.doc.toString() : '';
}

/**
 * 打开查找/替换面板（CodeMirror 面板同时包含查找与替换）
 */
export function openSearch() {
  if (editorView) openSearchPanel(editorView);
}

export function setEditorContent(content) {
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: content || '' },
    });
  }
}

export function destroyEditor() {
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  editorKey = null;
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
}
