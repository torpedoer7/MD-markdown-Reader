const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

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
          click: () => mainWindow.webContents.send('menu:save'),
        },
        { type: 'separator' },
        {
          label: '导出 PDF...',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('menu:export-pdf'),
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
          click: () => mainWindow.webContents.send('menu:find'),
        },
        {
          label: '替换',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.webContents.send('menu:replace'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换阅读/编辑',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu:toggle-mode'),
        },
        {
          label: '专注模式',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow.webContents.send('menu:toggle-focus'),
        },
        { type: 'separator' },
        {
          label: '新建标签页',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow.webContents.send('menu:new-tab'),
        },
        {
          label: '关闭标签页',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow.webContents.send('menu:close-tab'),
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
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开 Markdown 文件',
    filters: [{ name: 'Markdown 文件', extensions: ['md', 'markdown'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    openFile(result.filePaths[0]);
  }
}

// —— 读取并发送文件内容 ——
function openFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('file:open', { filePath, content });
  } catch (err) {
    dialog.showErrorBox('打开失败', `无法读取文件: ${err.message}`);
  }
}

// —— IPC: 渲染进程请求读取文件 ——
ipcMain.handle('file:read', async (_event, filePath) => {
  try {
    return { success: true, content: fs.readFileSync(filePath, 'utf-8') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// —— IPC: 保存文件 ——
ipcMain.handle('file:save', async (_event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// —— IPC: 导出 PDF ——
ipcMain.handle('export:pdf', async (_event, html) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 PDF',
    defaultPath: '文档.pdf',
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  });

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

  // 加载 HTML 内容
  await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  try {
    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      marginsType: 1, // 最小边距
      pageSize: 'A4',
    });
    fs.writeFileSync(result.filePath, pdfData);
    printWin.close();
    return { success: true, filePath: result.filePath };
  } catch (err) {
    printWin.close();
    return { success: false, error: err.message };
  }
});

// —— macOS: 双击 .md 文件打开 ——
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    openFile(filePath);
  } else {
    // 窗口还没创建，先存起来
    app._pendingFile = filePath;
  }
});

// —— Windows: 通过命令行参数打开 ——
app.on('second-instance', (_event, commandLine) => {
  // 取最后一个 .md 参数
  const args = commandLine.filter(arg => arg.endsWith('.md'));
  if (args.length > 0 && mainWindow) {
    openFile(args[args.length - 1]);
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
  createWindow();

  // 处理启动时待处理的文件
  if (app._pendingFile) {
    openFile(app._pendingFile);
    app._pendingFile = null;
  }

  // Windows: 处理命令行参数
  const mdArg = process.argv.find(arg => arg.endsWith('.md'));
  if (mdArg) {
    openFile(mdArg);
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
