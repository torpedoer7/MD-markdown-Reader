const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
// 窗口创建前收到的待打开文件
const pendingFiles = [];

// 判断命令行参数是否为 Markdown 文件（大小写不敏感）
function isMarkdownArg(arg) {
  const lower = arg.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

// 向主窗口发送消息；窗口已关闭时忽略，避免访问已销毁对象
function sendToMain(channel) {
  if (mainWindow) {
    mainWindow.webContents.send(channel);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 700,
    minHeight: 450,
    backgroundColor: '#181825',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 窗口关闭后释放引用，避免后续访问已销毁对象
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 新窗口加载完成后，处理队列中待打开的文件
  mainWindow.webContents.on('did-finish-load', () => {
    while (pendingFiles.length > 0) {
      openFileWhenReady(pendingFiles.shift());
    }
  });

  // 应用菜单（仅 macOS 需要，Windows 有原生菜单栏）
  const menuTemplate = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFileDialog(),
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToMain('menu:save'),
        },
        { type: 'separator' },
        {
          label: '导出 PDF...',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendToMain('menu:export-pdf'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: '查找',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendToMain('menu:find'),
        },
        {
          label: '替换',
          accelerator: 'CmdOrCtrl+H',
          click: () => sendToMain('menu:replace'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换阅读/编辑',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToMain('menu:toggle-mode'),
        },
        {
          label: '专注模式',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendToMain('menu:toggle-focus'),
        },
        { type: 'separator' },
        {
          label: '新建标签页',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendToMain('menu:new-tab'),
        },
        {
          label: '关闭标签页',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendToMain('menu:close-tab'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// —— 打开文件对话框 ——
async function openFileDialog() {
  // 窗口可能已关闭（macOS 菜单仍在），此时以无父窗口方式弹出对话框
  const options = {
    title: '打开 Markdown 文件',
    filters: [{ name: 'Markdown 文件', extensions: ['md', 'markdown'] }],
    properties: ['openFile'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (!result.canceled && result.filePaths.length > 0) {
    openFileWhenReady(result.filePaths[0]);
  }
}

// —— 读取并发送文件内容 ——
function openFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (mainWindow) {
      mainWindow.webContents.send('file:open', { filePath, content });
    }
  } catch (err) {
    dialog.showErrorBox('打开失败', `无法读取文件: ${err.message}`);
  }
}

// 渲染进程加载完成后再发送，避免消息在监听器注册前丢失
function openFileWhenReady(filePath) {
  if (!mainWindow) {
    // 窗口未创建或已关闭：先入队并创建新窗口，加载完成后处理
    pendingFiles.push(filePath);
    if (app.isReady()) {
      createWindow();
    }
    return;
  }
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => openFile(filePath));
  } else {
    openFile(filePath);
  }
}

// 校验 IPC 传入的文件路径：必须是 .md/.markdown 的绝对路径，防止渲染进程读写任意文件
function isValidMarkdownPath(filePath) {
  return typeof filePath === 'string'
    && path.isAbsolute(filePath)
    && /\.(md|markdown)$/i.test(filePath);
}

// —— IPC: 渲染进程请求读取文件 ——
ipcMain.handle('file:read', async (_event, filePath) => {
  if (!isValidMarkdownPath(filePath)) {
    return { success: false, error: '非法的文件路径' };
  }
  try {
    return { success: true, content: fs.readFileSync(filePath, 'utf-8') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// —— IPC: 保存文件 ——
ipcMain.handle('file:save', async (_event, { filePath, content } = {}) => {
  if (!isValidMarkdownPath(filePath) || typeof content !== 'string') {
    return { success: false, error: '非法的保存参数' };
  }
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// —— IPC: 导出 PDF ——
ipcMain.handle('export:pdf', async (_event, html) => {
  if (typeof html !== 'string') {
    return { success: false, error: '非法的导出内容' };
  }
  const options = {
    title: '导出 PDF',
    defaultPath: '文档.pdf',
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled) return { success: false, canceled: true };

  // 创建隐藏窗口渲染 PDF
  const printWin = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    // 加载 HTML 内容（loadURL 失败时也要关闭隐藏窗口，避免泄漏）
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      marginsType: 1, // 最小边距
      pageSize: 'A4',
    });
    fs.writeFileSync(result.filePath, pdfData);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (!printWin.isDestroyed()) printWin.close();
  }
});

// —— macOS: 双击 .md 文件打开 ——
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFileWhenReady(filePath);
});

// —— Windows: 通过命令行参数打开 ——
app.on('second-instance', (_event, commandLine) => {
  // 取最后一个 Markdown 文件参数
  const args = commandLine.filter(isMarkdownArg);
  if (args.length > 0) {
    openFileWhenReady(args[args.length - 1]);
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.whenReady().then(() => {
  // createWindow 加载完成后会自动处理 pendingFiles 队列
  createWindow();

  // Windows: 处理命令行参数
  const mdArg = process.argv.find(isMarkdownArg);
  if (mdArg) {
    openFileWhenReady(mdArg);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
