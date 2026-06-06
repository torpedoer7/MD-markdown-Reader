# MD 阅读器

跨平台 Markdown 桌面阅读/编辑器，支持 macOS 和 Windows。

---

## 功能

- **阅读模式**：优美中文排版，专注模式沉浸阅读
- **编辑模式**：左右分屏实时预览，CodeMirror 6 编辑器
- **多 Tab**：`Cmd+T` 新建，`Cmd+W` 关闭，支持拖拽文件打开
- **双主题**：深色 / 浅色，Claude Code 配色风格
- **代码高亮**：190+ 语言语法高亮，悬停复制按钮
- **搜索替换**：`Cmd+F` / `Cmd+H` 编辑器内搜索
- **自动保存**：3 秒防抖，dirty 标记
- **字数统计**：工具栏实时显示
- **导出 PDF**：排版优化的 PDF 导出
- **文件关联**：双击 .md 文件直接打开

## 截图

> 阅读模式（深色主题）

```
┌──────────────────────────────────────┐
│ [文件名.md]     1234字  浅色  专注  编辑  导出 │
├──────────────────────────────────────┤
│                                      │
│       # 标题                         │
│       正文内容排版...                  │
│       ```python                      │
│       code block with copy button    │
│       ```                            │
│                                      │
└──────────────────────────────────────┘
```

> 编辑模式（左右分屏）

```
┌──────────────────┬───────────────────┐
│  Markdown 源码    │  实时预览          │
│  (CodeMirror)    │  (marked 渲染)     │
│  显示语法符号     │  排版效果          │
└──────────────────┴───────────────────┘
```

## 技术栈

| 层 | 选择 |
|---|---|
| 桌面框架 | Electron 28 |
| Markdown 解析 | marked |
| 代码高亮 | highlight.js |
| 编辑器 | CodeMirror 6 |
| 打包 | electron-builder |

## 开发

```bash
# 安装依赖
npm install

# 开发运行
npm start

# 打包 macOS
npm run build:mac

# 打包 Windows
npm run build:win
```

## 下载

从 [Releases](../../releases) 页面下载最新安装包：

- **macOS**: `MD阅读器-x.x.x-arm64.dmg`
- **Windows**: `MD阅读器 Setup x.x.x.exe`

## 许可

MIT
