const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 监听主进程发来的文件打开事件
  onFileOpen: (callback) => {
    ipcRenderer.on('file:open', (_event, data) => callback(data));
  },
  // 监听菜单命令
  onMenuCommand: (channel, callback) => {
    ipcRenderer.on(channel, () => callback());
  },
  // 读取文件
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  // 保存文件
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
  // 导出 PDF
  exportPDF: (html) => ipcRenderer.invoke('export:pdf', html),
});
