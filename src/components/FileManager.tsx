// 基本功能：
// 1. 瀏覽文件和資料夾
// 2. 上傳、下載文件
// 3. 創建、刪除資料夾
// 4. 批次處理文件
// 5. 搜索文件
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Loader, 
  Trash2, 
  Search, 
  Upload, 
  FolderPlus, 
  Database, 
  Languages,
  MoreVertical,
  File as FileIcon,
  ChevronLeft,
  MessageSquare,
  Download,
  List,
  Grid
} from 'lucide-react';

interface FileInfo {
  id: string; // 文件的唯一標識符
  name: string; // 文件名稱
  size: number; // 文件大小
  type: string; // 文件類型
  created_at: string; // 文件創建時間
  path: string; // 文件路徑
  isDirectory: boolean; // 是否為資料夾
}

interface FileManagerProps {
  knowledgeBases: Array<{ id: string; name: string }>; // 知識庫列表
  onBatchTranslateAndEmbed: (
    files: string[], 
    knowledgeBaseId: string, 
    onProgress: (progress: number) => void
  ) => Promise<void>; // 批次翻譯並嵌入的函數
  onBatchEmbed: (
    files: string[], 
    knowledgeBaseId: string,
    onProgress: (progress: number) => void
  ) => Promise<void>; // 批次嵌入的函數
  onModeChange: (mode: 'chat' | 'file') => void; // 切換模式的函數
  onFileChat: (files: string[]) => void; // 開始文件對話的函數
  files: FileInfo[]; // 文件列表
  onFilesChange: (files: FileInfo[]) => void; // 文件列表變更的函數
}

const API_URL = process.env.REACT_APP_API_URL;

export const FileManager: React.FC<FileManagerProps> = ({
  knowledgeBases,
  onBatchTranslateAndEmbed,
  onBatchEmbed,
  onModeChange,
  onFileChat,
  files,
  onFilesChange
}) => {
  const [loading, setLoading] = useState(false); // 加載狀態
  const [searchTerm, setSearchTerm] = useState(''); // 搜索關鍵字
  const [currentPath, setCurrentPath] = useState('/'); // 當前路徑
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]); // 選中的文件ID
  const [showNewFolderModal, setShowNewFolderModal] = useState(false); // 是否顯示新建資料夾模態框
  const [newFolderName, setNewFolderName] = useState(''); // 新資料夾名稱
  const [showActionModal, setShowActionModal] = useState(false); // 是否顯示操作模態框
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState(''); // 選中的知識庫ID
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set()); // 展開的資料夾
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'background' | 'file' | 'folder';
    target?: FileInfo;
  } | null>(null); // 右鍵選單狀態
  const [processing, setProcessing] = useState(false); // 處理狀態
  const [progress, setProgress] = useState(0); // 處理進度
  const [currentAction, setCurrentAction] = useState<'translate' | 'direct'>('direct'); // 當前操作
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ show: false, message: '', type: 'success' }); // 通知狀態
  const [isCtrlPressed, setIsCtrlPressed] = useState(false); // Ctrl鍵狀態
  const [isUploading, setIsUploading] = useState(false); // 上傳狀態
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isSelecting: boolean;
  } | null>(null); // 框選狀態
  const fileListRef = useRef<HTMLDivElement>(null); // 文件列表的引用
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); // 視圖模式

  // 獲取檔案列表
  const fetchFiles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        path: currentPath,
        search: searchTerm
      });
      
      const response = await fetch(`${API_URL}/api/files?${params}`);
      if (response.ok) {
        const data = await response.json();
        onFilesChange(data);
      }
    } catch (error) {
      console.error('獲取檔案列表失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  // 創建新資料夾
  const handleCreateFolder = async () => {
    if (!newFolderName) return;
    
    try {
      const response = await fetch(`${API_URL}/api/files/create_folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: currentPath === '/' ? newFolderName : `${currentPath}/${newFolderName}`
        })
      });

      if (response.ok) {
        fetchFiles();
        setShowNewFolderModal(false);
        setNewFolderName('');
        showNotification('資料夾創建成功', 'success');
      }
    } catch (error) {
      console.error('創建資料夾失敗:', error);
      setNotification({
        show: true,
        message: '創建資料夾失敗',
        type: 'error'
      });
    }
  };

  // 修改 notification 的設置方式
  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({
      show: true,
      message,
      type
    });

    // 0.7秒後自動關閉通知
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 700);
  };

  // 在上傳檔案的處理中使用新的通知函數
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    const validFiles = Array.from(files).filter(file => {
      if (file.size > maxSize) {
        showNotification(`檔案 ${file.name} 超過大小限制 (10MB)`, 'error');
        return false;
      }
      if (!allowedTypes.includes(file.type)) {
        showNotification(`檔案 ${file.name} 類型不支援`, 'error');
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const formData = new FormData();
    validFiles.forEach(file => {
      formData.append('files', file);
    });
    formData.append('path', currentPath);

    try {
      setIsUploading(true);
      const response = await fetch(`${API_URL}/api/files/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        fetchFiles();
        showNotification('檔案上傳成功', 'success');
      }
    } catch (error) {
      console.error('檔案上傳失敗:', error);
      showNotification('檔案上傳失敗', 'error');
    } finally {
      setIsUploading(false);
      closeContextMenu();
    }
  };

  // 切換資料夾展開狀態
  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // 修改檔案選擇邏輯
  const handleSelect = (file: FileInfo, e?: React.MouseEvent) => {
    setSelectedFiles(prev => {
      if (isCtrlPressed || e?.ctrlKey || e?.metaKey) {
        // Ctrl/Cmd + 點擊：切換選擇
        return prev.includes(file.id)
          ? prev.filter(id => id !== file.id)
          : [...prev, file.id];
      } else {
        // 一般點擊：單選
        return prev.includes(file.id) ? [] : [file.id];
      }
    });
  };

  // 修改處理批次操作的函數
  const handleBatchAction = async (action: 'translate' | 'direct') => {
    if (!selectedKnowledgeBase || selectedFiles.length === 0) return;

    setProcessing(true);
    setProgress(0);
    
    try {
      // 檢查是否為資料夾處理
      const isFolder = contextMenu?.type === 'folder';
      let filesToProcess = selectedFiles;

      // 如果是資料夾，獲取資料夾內所有檔案
      if (isFolder && contextMenu?.target) {
        const response = await fetch(`${API_URL}/api/files?path=${encodeURIComponent(contextMenu.target.path)}`);
        if (!response.ok) {
          throw new Error('無法獲取資料夾內容');
        }
        const folderContents = await response.json();
        filesToProcess = folderContents
          .filter((item: FileInfo) => !item.isDirectory)
          .map((item: FileInfo) => item.id);
      }

      if (action === 'translate') {
        await onBatchTranslateAndEmbed(
          filesToProcess,
          selectedKnowledgeBase,
          setProgress
        );
      } else {
        await onBatchEmbed(
          filesToProcess,
          selectedKnowledgeBase,
          setProgress
        );
      }
      setSelectedFiles([]);
      setShowActionModal(false);
      showNotification('處理完成！', 'success');
    } catch (error) {
      console.error('批次處理失敗:', error);
      showNotification('處理失敗，請稍後重試', 'error');
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  // 修改右鍵選單
  const handleContextMenu = useCallback((
    e: React.MouseEvent,
    type: 'background' | 'file' | 'folder',
    target?: FileInfo
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      target
    });
  }, []);

  // 關閉右選單
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 點擊其他地方時關閉選單
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [closeContextMenu]);

  useEffect(() => {
    fetchFiles();
  }, [currentPath, searchTerm]);

  // 修改刪除檔案的函數
  const handleDeleteFile = async (fileId: string) => {
    try {
      // 處理檔案路徑，確保正確編碼
      const encodedFileId = encodeURIComponent(fileId);
      const response = await fetch(`${API_URL}/api/files/${encodedFileId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchFiles();
        closeContextMenu();
      } else if (response.status === 404) {
        // 如果檔案在資料夾中，嘗試使用完整路徑刪除
        const folderPath = currentPath === '/' ? '' : currentPath;
        const fullPath = `${folderPath}/${fileId}`.replace(/^\/+/, '');
        const encodedFullPath = encodeURIComponent(fullPath);
        
        const secondResponse = await fetch(`${API_URL}/api/files/${encodedFullPath}`, {
          method: 'DELETE'
        });
        
        if (secondResponse.ok) {
          fetchFiles();
          closeContextMenu();
        } else {
          console.error('刪除檔案失敗');
        }
      }
    } catch (error) {
      console.error('刪除檔案失敗:', error);
    }
  };

  // 修改刪除資料夾的函數
  const handleDeleteFolder = async (folderPath: string) => {
    try {
      const encodedPath = encodeURIComponent(folderPath);
      const response = await fetch(`${API_URL}/api/files/folder/${encodedPath}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchFiles();
        showNotification('資料夾刪除成功', 'success');
      } else {
        const error = await response.json();
        throw new Error(error.detail || '刪除資料夾失敗');
      }
    } catch (error) {
      console.error('刪除資料夾失敗:', error);
      showNotification('刪除資料夾失敗', 'error');
    }
  };

  // 添加返回上一層的功能
  const handleGoBack = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    setCurrentPath(parentPath || '/');
  };

  // 監聽按鍵事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // 修改下載檔案的處理函數
  const handleDownloadFile = async (file: FileInfo) => {
    try {
      // 構建完整的檔案路徑
      const filePath = currentPath === '/' 
        ? file.name 
        : `${currentPath}/${file.name}`;
      
      console.log('準備下載檔案:', filePath);
      
      // 使用 GET 請求而不是 POST
      const response = await fetch(`${API_URL}/api/files/download/${encodeURIComponent(filePath)}`);

      if (!response.ok) {
        throw new Error('下載失敗');
      }

      // 取得 blob 數據
      const blob = await response.blob();
      
      // 創建下載連結
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      closeContextMenu();
      showNotification('檔案下載成功', 'success');
    } catch (error) {
      console.error('下載檔案失敗:', error);
      showNotification('下載檔案失敗', 'error');
    }
  };

  // 處理滑鼠按下事件
  const handleMouseDown = (e: React.MouseEvent) => {
    // 只處理左鍵點擊
    if (e.button !== 0) return;
    
    // 如果點擊的是檔案或資料夾,不啟動框選
    if ((e.target as HTMLElement).closest('.file-item')) return;

    const container = fileListRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSelectionBox({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      isSelecting: true
    });
  };

  // 處理滑鼠移動事件
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selectionBox?.isSelecting) return;

    const container = fileListRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setSelectionBox(prev => ({
      ...prev!,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top
    }));

    // 計算框選區域
    const selectionRect = getSelectionRect();
    
    // 檢查每個檔案是否在框選區域內
    files.forEach(file => {
      const fileElement = document.getElementById(`file-${file.id}`);
      if (fileElement) {
        const fileRect = fileElement.getBoundingClientRect();
        const isIntersecting = isRectIntersecting(selectionRect, {
          left: fileRect.left - rect.left,
          top: fileRect.top - rect.top,
          right: fileRect.right - rect.left,
          bottom: fileRect.bottom - rect.top
        });

        if (isIntersecting) {
          if (!selectedFiles.includes(file.id)) {
            setSelectedFiles(prev => [...prev, file.id]);
          }
        } else if (!isCtrlPressed) {
          setSelectedFiles(prev => prev.filter(id => id !== file.id));
        }
      }
    });
  };

  // 處理滑鼠放開事件
  const handleMouseUp = () => {
    setSelectionBox(null);
  };

  // 計算框選區域
  const getSelectionRect = () => {
    if (!selectionBox) return null;

    const left = Math.min(selectionBox.startX, selectionBox.currentX);
    const top = Math.min(selectionBox.startY, selectionBox.currentY);
    const right = Math.max(selectionBox.startX, selectionBox.currentX);
    const bottom = Math.max(selectionBox.startY, selectionBox.currentY);

    return { left, top, right, bottom };
  };

  // 檢查兩個矩形是否相交
  const isRectIntersecting = (rect1: any, rect2: any) => {
    return !(rect2.left > rect1.right || 
            rect2.right < rect1.left || 
            rect2.top > rect1.bottom ||
            rect2.bottom < rect1.top);
  };

  // 添加全選功能
  const handleSelectAll = () => {
    if (selectedFiles.length === files.filter(f => !f.isDirectory).length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.filter(f => !f.isDirectory).map(file => file.id));
    }
  };

  // 添加批次刪除功能
  const handleBatchDelete = async () => {
    if (!window.confirm(`確定要刪除選中的 ${selectedFiles.length} 個檔案嗎？`)) {
      return;
    }
    
    try {
      await Promise.all(selectedFiles.map(fileId => handleDeleteFile(fileId)));
      setSelectedFiles([]);
      showNotification('批次刪除成功', 'success');
    } catch (error) {
      console.error('批次刪除失敗:', error);
      showNotification('批次刪除失敗', 'error');
    }
  };

  // 添加批次下載功能
  const handleBatchDownload = async () => {
    try {
      await Promise.all(selectedFiles.map(fileId => {
        const file = files.find(f => f.id === fileId);
        if (file && !file.isDirectory) {
          return handleDownloadFile(file);
        }
      }));
      showNotification('批次下載成功', 'success');
    } catch (error) {
      console.error('批次下載失敗:', error);
      showNotification('批次下載失敗', 'error');
    }
  };

  return (
    <div className="h-full flex flex-col relative" onContextMenu={(e) => handleContextMenu(e, 'background')}>
      {/* 頂部工具列 */}
      <div className="p-4 border-b flex justify-between items-center">
        <div className="flex items-center space-x-4">
          {/* 添加返回按鈕 */}
          {currentPath !== '/' && (
            <button
              onClick={handleGoBack}
              className="p-2 hover:bg-gray-100 rounded-lg flex items-center text-gray-600"
              title="返回上一層"
            >
              <ChevronLeft className="w-5 h-5" />
              返上一層
            </button>
          )}
          <h2 className="text-xl font-bold">檔案管理</h2>
          {/* 顯示當前路徑 */}
          <span className="text-sm text-gray-500">
            {currentPath === '/' ? '根目錄' : currentPath}
          </span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋檔案..."
              className="pl-10 pr-4 py-2 border rounded-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {/* 添加全選按鈕 */}
          {files.some(f => !f.isDirectory) && (
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {selectedFiles.length === files.filter(f => !f.isDirectory).length ? '取消全選' : '全選'}
            </button>
          )}
          
          {/* 批次操作按鈕 */}
          {selectedFiles.length > 0 && (
            <>
              <button
                onClick={handleBatchDownload}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                下載所選 ({selectedFiles.length})
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                刪除所選 ({selectedFiles.length})
              </button>
              <button
                onClick={() => {
                  setCurrentAction('translate');
                  setShowActionModal(true);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center"
              >
                <Languages className="w-4 h-4 mr-2" />
                翻譯後加入 ({selectedFiles.length})
              </button>
              <button
                onClick={() => {
                  setCurrentAction('direct');
                  setShowActionModal(true);
                }}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center"
              >
                <Database className="w-4 h-4 mr-2" />
                直接加入 ({selectedFiles.length})
              </button>
            </>
          )}

          <button
            onClick={() => setShowNewFolderModal(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200"
          >
            <FolderPlus className="inline-block w-4 h-4 mr-2" />
            新增資料夾
          </button>
          <label className="px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600">
            <input
              type="file"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
            <Upload className="inline-block w-4 h-4 mr-2" />
            上傳檔案
          </label>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 hover:bg-gray-100 rounded-lg tooltip"
            data-tip={viewMode === 'grid' ? '切換到列表視圖' : '切換到網格視圖'}
          >
            {viewMode === 'grid' ? (
              <List className="w-5 h-5" />
            ) : (
              <Grid className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* 檔案列表 */}
      <div 
        ref={fileListRef}
        className="flex-1 overflow-auto p-4 relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {viewMode === 'grid' ? (
          // 網格視圖
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {/* 資料夾列表 */}
            {files.filter(f => f.isDirectory).map(folder => (
              <div
                id={`file-${folder.id}`}
                key={folder.id}
                className={`file-item group relative p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer
                  ${selectedFiles.includes(folder.id) ? 'bg-blue-50 border-blue-200' : ''}`}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || isCtrlPressed) {
                    handleSelect(folder, e);
                  } else {
                    setCurrentPath(folder.path);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleContextMenu(e, 'folder', folder);
                }}
              >
                <div className="flex flex-col items-center">
                  <FolderPlus className="w-12 h-12 text-yellow-500 mb-2" />
                  <span className="text-center truncate w-full">{folder.name}</span>
                </div>
              </div>
            ))}

            {/* 檔案列表 */}
            {files.filter(f => !f.isDirectory).map(file => (
              <div
                id={`file-${file.id}`}
                key={file.id}
                className={`file-item group relative p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer
                  ${selectedFiles.includes(file.id) ? 'bg-blue-50 border-blue-200' : ''}`}
                onClick={(e) => handleSelect(file, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleContextMenu(e, 'file', file);
                }}
              >
                <div className="flex flex-col items-center">
                  <FileIcon className="w-12 h-12 text-gray-500 mb-2" />
                  <span className="text-center truncate w-full">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(2)} KB
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(file.id)}
                  onChange={() => handleSelect(file)}
                  className="absolute top-2 left-2 opacity-0 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </div>
        ) : (
          // 列表視圖
          <div className="space-y-1">
            {files.map(file => (
              <div
                key={file.id}
                id={`file-${file.id}`}
                className={`flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer
                  ${selectedFiles.includes(file.id) ? 'bg-blue-50 border-blue-200' : ''}`}
                onClick={(e) => file.isDirectory ? setCurrentPath(file.path) : handleSelect(file, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleContextMenu(e, file.isDirectory ? 'folder' : 'file', file);
                }}
              >
                <div className="flex items-center flex-1 min-w-0">
                  <div className="w-8 flex-shrink-0">
                    {file.isDirectory ? (
                      <FolderPlus className="w-5 h-5 text-yellow-500" />
                    ) : (
                      <FileIcon className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <span className="truncate flex-1">{file.name}</span>
                  {!file.isDirectory && (
                    <span className="text-xs text-gray-500 ml-2">
                      {(file.size / 1024).toFixed(2)} KB
                    </span>
                  )}
                </div>
                {!file.isDirectory && (
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(file.id)}
                    onChange={() => handleSelect(file)}
                    className="ml-2"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* 框選區域 */}
        {selectionBox && (
          <div
            className="absolute border-2 border-blue-500 bg-blue-100 bg-opacity-20 pointer-events-none"
            style={{
              left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
              top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
              width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
              height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`
            }}
          />
        )}
      </div>

      {/* 右鍵選單 */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-lg py-2 min-w-[240px] z-50"
          style={{ 
            top: `${contextMenu.y}px`, 
            left: `${contextMenu.x}px`,
            maxWidth: '300px'
          }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.type === 'file' ? (
            <>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                onClick={() => {
                  setCurrentAction('translate');
                  setShowActionModal(true);
                  closeContextMenu();
                }}
              >
                <Languages className="w-5 h-5 mr-3" />
                <span className="flex-1">翻譯後加入知識庫 ({selectedFiles.length} 個檔案)</span>
              </button>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                onClick={() => {
                  setCurrentAction('direct');
                  setShowActionModal(true);
                  closeContextMenu();
                }}
              >
                <Database className="w-5 h-5 mr-3" />
                <span className="flex-1">直接加入知識庫 ({selectedFiles.length} 個檔案)</span>
              </button>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                onClick={() => {
                  onModeChange("chat");
                  onFileChat(selectedFiles);
                  closeContextMenu();
                }}
              >
                <MessageSquare className="w-5 h-5 mr-3" />
                <span className="flex-1">開始檔案對話 ({selectedFiles.length} 個檔案)</span>
              </button>
              {contextMenu?.type === 'file' && contextMenu.target && (
                <button
                  className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                  onClick={() => {
                    if (contextMenu.target) {
                      handleDownloadFile(contextMenu.target);
                    }
                  }}
                >
                  <Download className="w-5 h-5 mr-3" />
                  <span className="flex-1">下載檔案</span>
                </button>
              )}
              <div className="border-t my-1"></div>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center text-red-500"
                onClick={() => {
                  selectedFiles.forEach(fileId => handleDeleteFile(fileId));
                  closeContextMenu();
                }}
              >
                <Trash2 className="w-5 h-5 mr-3" />
                <span className="flex-1">刪除選中檔案 ({selectedFiles.length})</span>
              </button>
            </>
          ) : contextMenu.type === 'folder' ? (
            <>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                onClick={() => {
                  if (contextMenu.target) {
                    setSelectedFiles([contextMenu.target.id]);
                    setCurrentAction('translate');  // 設置為翻譯模式
                    setShowActionModal(true);
                  }
                  closeContextMenu();
                }}
              >
                <Languages className="w-5 h-5 mr-3" />
                <span className="flex-1">翻譯後加入知識庫</span>
              </button>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                onClick={() => {
                  if (contextMenu.target) {
                    setSelectedFiles([contextMenu.target.id]);
                    setCurrentAction('direct');  // 設置為直接加入模式
                    setShowActionModal(true);
                  }
                  closeContextMenu();
                }}
              >
                <Database className="w-5 h-5 mr-3" />
                <span className="flex-1">直接加入知識庫</span>
              </button>
              <div className="border-t my-1"></div>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                onClick={() => {
                  const fileInput = document.createElement('input');
                  fileInput.type = 'file';
                  fileInput.multiple = true;
                  fileInput.onchange = async (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (files) {
                      const formData = new FormData();
                      Array.from(files).forEach(file => {
                        formData.append('files', file);
                      });
                      formData.append('path', contextMenu.target!.path);

                      try {
                        setIsUploading(true);
                        const response = await fetch('${API_URL}/api/files/upload', {
                          method: 'POST',
                          body: formData,
                        });
                        
                        if (response.ok) {
                          fetchFiles();
                          showNotification('檔案上傳成功', 'success');
                        }
                      } catch (error) {
                        console.error('檔案上傳失敗:', error);
                        showNotification('檔案上傳失敗', 'error');
                      } finally {
                        setIsUploading(false);
                        closeContextMenu();
                      }
                    }
                  };
                  fileInput.click();
                }}
              >
                <Upload className="w-5 h-5 mr-3" />
                <span className="flex-1">上傳檔案到此資料夾</span>
              </button>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center text-red-500"
                onClick={() => {
                  if (window.confirm('確定要刪除此資料夾及其所有內容嗎？此操作無法恢復。')) {
                    handleDeleteFolder(contextMenu.target!.path);
                    closeContextMenu();
                  }
                }}
              >
                <Trash2 className="w-5 h-5 mr-3" />
                <span className="flex-1">刪除資料夾</span>
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                onClick={() => {
                  setShowNewFolderModal(true);
                  closeContextMenu();
                }}
              >
                <FolderPlus className="w-5 h-5 mr-3" />
                <span className="flex-1">新增資料夾</span>
              </button>
              <button
                className="w-full px-6 py-2.5 text-left hover:bg-gray-100 flex items-center"
                onClick={() => {
                  const fileInput = document.createElement('input');
                  fileInput.type = 'file';
                  fileInput.multiple = true;
                  fileInput.onchange = (e) => handleFileUpload(e as any);
                  fileInput.click();
                  closeContextMenu();
                }}
              >
                <Upload className="w-5 h-5 mr-3" />
                <span className="flex-1">上傳檔案</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 新增資料夾模態框 */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-bold mb-4">新增資料夾</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (newFolderName) {
                handleCreateFolder();
              }
            }}>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="資料夾名稱"
                className="w-full p-2 border rounded mb-4"
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  disabled={!newFolderName}
                >
                  創建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 處理案模態框 */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-bold mb-4">
              {contextMenu?.type === 'folder' ? '處理資料夾' : '處理檔案'}
            </h3>
            
            <div className="mb-4">
              <select
                className="w-full p-2 border rounded"
                value={selectedKnowledgeBase}
                onChange={(e) => setSelectedKnowledgeBase(e.target.value)}
              >
                <option value="">請選擇知識庫</option>
                {knowledgeBases.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.name}</option>
                ))}
              </select>
            </div>

            {contextMenu?.type === 'folder' && contextMenu.target && (
              <p className="text-sm text-gray-500 mb-4">
                將處理資料夾: {contextMenu.target.path}
              </p>
            )}

            {processing && (
              <div className="mb-4">
                <div className="relative pt-1">
                  <div className="flex mb-2 items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                        處理進度
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold inline-block text-blue-600">
                        {progress}%
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-100">
                    <div
                      style={{ width: `${progress}%`, transition: 'width 0.5s ease-in-out' }}
                      className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500"
                    ></div>
                  </div>
                  <p className="text-sm text-gray-500 text-center">
                    {progress < 30 && "準備處理文件..."}
                    {progress >= 30 && progress < 60 && "正在翻譯文件..."}
                    {progress >= 60 && progress < 90 && "正在加入知識庫..."}
                    {progress >= 90 && "即將完成..."}
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowActionModal(false)}
                className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                disabled={processing}
              >
                取消
              </button>
              <button
                onClick={() => handleBatchAction(currentAction)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={!selectedKnowledgeBase || processing}
              >
                確認加入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 通知元素 */}
      {notification.show && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black bg-opacity-30" />
          <div
            className={`relative px-6 py-4 rounded-lg shadow-lg ${
              notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            } text-white transform transition-all duration-300 ease-out`}
          >
            <div className="flex items-center space-x-2">
              {notification.type === 'success' ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-lg font-medium">{notification.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
