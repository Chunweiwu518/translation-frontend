import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Chat } from "./components/Chat";
import { WelcomeChatScreen } from "./components/WelcomeChatScreen"; // 新增此組件
import { useChat } from "./hooks/useChat";
import { useFileProcessing } from "./hooks/useFileProcessing";
import { useKnowledgeBase } from "./hooks/useKnowledgeBase";
import { ModelSettings, ChatModeProps, Message, TranslatedFile, FileInfo } from "./types";
import { FileManager } from './components/FileManager';
import { KnowledgeBaseManager } from './components/KnowledgeBaseManager';
import { TranslatedFilesView } from './components/TranslatedFilesView';

const ChatMode: React.FC<ChatModeProps> = ({
  chat,
  knowledgeBase,
  modelSettings,
  onSettingsChange,
}) => {
  const API_URL = process.env.REACT_APP_API_URL;

  if (!chat.currentSession) {
    return (
      <WelcomeChatScreen 
        onCreateNewChat={() => chat.createNewChatSession(knowledgeBase.currentKnowledgeBase)}
      />
    );
  }

  return (
    <div className="h-full">
      <Chat
        messages={chat.messages}
        onSendMessage={(text) => 
          chat.handleSendMessage(
            text, 
            knowledgeBase.currentKnowledgeBase, 
            modelSettings
          )}
        onClearChat={() => chat.setMessages([])}
        currentKnowledgeBaseName={
          knowledgeBase.knowledgeBases.find(
            (kb) => kb.id === knowledgeBase.currentKnowledgeBase
          )?.name || ""
        }
        modelSettings={modelSettings}
        onSettingsChange={onSettingsChange}
        knowledgeBases={knowledgeBase.knowledgeBases}
        currentKnowledgeBase={knowledgeBase.currentKnowledgeBase}
        onSwitchKnowledgeBase={knowledgeBase.setCurrentKnowledgeBase}
        onCreateKnowledgeBase={knowledgeBase.createKnowledgeBase}
        onResetKnowledgeBase={knowledgeBase.resetKnowledgeBase}
        onDeleteKnowledgeBase={knowledgeBase.deleteKnowledgeBase}
        onUploadAndEmbed={async (file: File, needTranslation: boolean) => {
          const formData = new FormData();
          formData.append("file", file);
    
          try {
            const uploadEndpoint = needTranslation
              ? `${API_URL}/api/upload_and_translate`
              : `${API_URL}/api/upload`;
    
            const uploadResponse = await fetch(uploadEndpoint, {
              method: "POST",
              body: formData,
            });
    
            if (uploadResponse.ok) {
              const data = await uploadResponse.json();
              const content = needTranslation ? data.translated_content : data.content;
    
              const embedResponse = await fetch(`${API_URL}/api/embed`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: content,
                  filename: file.name,
                  knowledge_base_id: knowledgeBase.currentKnowledgeBase,
                }),
              });
    
              if (embedResponse.ok) {
                const successMessage: Message = {
                  sender: "system",
                  text: `文件 "${file.name}" 已成功添加到知識庫中。`,
                };
                chat.setMessages((prev: Message[]) => [...prev, successMessage]);
              }
            }
          } catch (error) {
            console.error("處理文件時出錯:", error);
            const errorMessage: Message = {
              sender: "system",
              text: `處理文件 "${file.name}" 時出錯。請稍後重試。`,
            };
            chat.setMessages((prev: Message[]) => [...prev, errorMessage]);
          }
        }}
      />
    </div>
  );
};

const App: React.FC = () => {
  // Hooks 應該都在這裡
  const [currentMode, setCurrentMode] = useState("files");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    model: "llama3.1-ffm-70b-32k-chat",
    temperature: 0.3,
    maxTokens: 2000,
    topP: 0.3,
    frequencyPenalty: 1,
    seed: 42,
    topK_model: 0.3,
    topK_RAG: 3,
    similarityThreshold: 0.7,
  });

  const knowledgeBase = useKnowledgeBase();
  const fileProcessing = useFileProcessing();
  const chat = useChat();

  // 將所有的 http://localhost:5000 改為使用環境變數
  const API_URL = process.env.REACT_APP_API_URL;
  console.log('API URL:', API_URL); // 檢查環境變數是否正確載入

  // 新增獲取資料夾內所有檔案的函數
  const getFolderFiles = async (folderPath: string): Promise<string[]> => {
    try {
      const response = await fetch(`${API_URL}/api/files/recursive?path=${encodeURIComponent(folderPath)}`);
      if (response.ok) {
        const files: FileInfo[] = await response.json();
        return files.map(file => file.path);
      }
      return [];
    } catch (error) {
      console.error('獲取資料夾檔案失敗:', error);
      return [];
    }
  };

  // 修改批次翻譯和嵌入函數
  const handleBatchTranslateAndEmbed = async (
    paths: string[],
    knowledgeBaseId: string,
    onProgress: (progress: number) => void
  ): Promise<void> => {
    try {
      let allFiles: string[] = [];
      
      // 收集所有檔案路徑
      for (const path of paths) {
        const fileInfo = files.find((f: FileInfo) => f.id === path);
        if (fileInfo) {
          if (fileInfo.isDirectory) {
            const folderFiles = await getFolderFiles(fileInfo.path);
            allFiles = [...allFiles, ...folderFiles];
          } else {
            allFiles.push(fileInfo.path);
          }
        }
      }

      const totalFiles = allFiles.length;
      let currentFileIndex = 0;

      for (const filePath of allFiles) {
        // 獲取檔案的目錄路徑
        const pathParts = filePath.split('/');
        pathParts.pop(); // 移除檔案名
        const directoryPath = pathParts.join('/');

        // 更新進度 - 開始處理新檔案
        const baseProgress = (currentFileIndex / totalFiles) * 100;
        onProgress(Math.round(baseProgress));

        // 從檔案系統讀取檔案內容
        const fileResponse = await fetch(`${API_URL}/api/files/content/${filePath}`);
        if (!fileResponse.ok) {
          throw new Error(`無法讀取檔案 ${filePath}`);
        }
        const { content: originalContent } = await fileResponse.json();

        // 更新進度 - 開始翻譯
        onProgress(Math.round(baseProgress + (100 / totalFiles) * 0.3));

        // 翻譯處理...
        const formData = new FormData();
        const blob = new Blob([originalContent], { type: 'text/plain' });
        const fileName = filePath.split('/').pop() || 'file.txt';
        formData.append('file', blob, fileName);

        const translateResponse = await fetch(
          `${API_URL}/api/upload_and_translate`,
          {
            method: 'POST',
            body: formData,
          }
        );

        // 更新進度 - 翻譯完成
        onProgress(Math.round(baseProgress + (100 / totalFiles) * 0.6));

        if (!translateResponse.ok) {
          const errorData = await translateResponse.json();
          throw new Error(`翻譯失敗: ${errorData.detail || '未知錯誤'}`);
        }

        const data = await translateResponse.json();
        
        // 保存原始文件到原始目錄
        const originalFormData = new FormData();
        const originalBlob = new Blob([originalContent], { type: 'text/plain' });
        originalFormData.append('files', originalBlob, fileName);
        originalFormData.append('path', directoryPath || '/');  // 使用檔案原始目錄路徑

        // 上傳原始文件
        const uploadOriginalResponse = await fetch(`${API_URL}/api/files/upload`, {
          method: 'POST',
          body: originalFormData,
        });

        if (!uploadOriginalResponse.ok) {
          throw new Error('保存原始文件失敗');
        }

        // 加入知識庫
        const embedResponse = await fetch(`${API_URL}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: data.translated_content,
            filename: fileName,
            knowledge_base_id: knowledgeBaseId,
          }),
        });

        if (!embedResponse.ok) {
          throw new Error('加入知識庫失敗');
        }

        // 更新翻譯文件檢視
        fileProcessing.setTranslatedFiles(prev => [...prev, {
          id: Math.random().toString(),
          name: fileName,
          translatedContent: data.translated_content,
          originalContent: originalContent,
          status: 'completed',
          isEmbedded: true,
          embeddingProgress: 100
        }]);

        // 更新進度 - 加入知識庫
        onProgress(Math.round(baseProgress + (100 / totalFiles) * 0.9));

        // 完成當前檔案處理
        currentFileIndex++;
        onProgress(Math.round((currentFileIndex / totalFiles) * 100));
      }

      // 確保最後顯示 100%
      onProgress(100);
    } catch (error) {
      console.error('處理檔案時出錯:', error);
      throw error;
    }
  };

  // 修改檔案對話處理函數
  const handleFileChat = async (filePaths: string[]): Promise<void> => {
    try {
      // 顯示始化訊息
      const initMessage: Message = {
        sender: "system",
        text: `正在處理 ${filePaths.length} 個檔案，請稍候...`,
      };
      chat.setMessages([initMessage]);

      // 依序處理每個檔案
      for (const file_path of filePaths) {
        // 獲取檔案內容
        const fileResponse = await fetch(`${API_URL}/api/files/translated_content/${file_path}`);
        if (!fileResponse.ok) {
          throw new Error(`無法讀取檔案 ${file_path}`);
        }
        const { content: translatedContent } = await fileResponse.json();

        // 將檔案加入知識庫
        const embedResponse = await fetch(`${API_URL}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: translatedContent,  // 使用翻譯後的內容
            filename: file_path,
            knowledge_base_id: 'default',  // 使用預設知識庫
          }),
        });

        if (!embedResponse.ok) {
          throw new Error(`檔案 ${file_path} 加入知識庫失敗`);
        }
      }

      // 更新成功訊息
      const successMessage: Message = {
        sender: "system",
        text: `已成功載入 ${filePaths.length} 個翻譯檔案到預設知識庫，您可以開始詢問相關問題。`,
      };
      chat.setMessages([successMessage]);

    } catch (error: unknown) {
      console.error('處理檔案對話時錯:', error);
      const errorMessage: Message = {
        sender: "system",
        text: `處理檔案時出錯: ${error instanceof Error ? error.message : '未知錯誤'}`,
      };
      chat.setMessages([errorMessage]);
    }
  };

  // 在 App.tsx 或其他使用 TranslatedFilesView 的地方
  const handleDownloadTranslation = (file: TranslatedFile) => {
    // 創建 Blob 對象
    const content = `原文：\n\n${file.originalContent}\n\n翻譯：\n\n${file.translatedContent}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    
    // 創建下載連結
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name}_翻譯結果.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 添加獲取檔案列表的函數
  const fetchFiles = async () => {
    try {
      const response = await fetch(`${API_URL}/api/files?path=/`);
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('獲取檔案列表失敗:', error);
    }
  };

  // 在 useEffect 中獲取檔案列表
  useEffect(() => {
    fetchFiles();
  }, []);

  // 在 handleBatchTranslateAndEmbed 函數後面添加
  const handleBatchEmbed = async (
    paths: string[],
    knowledgeBaseId: string,
    onProgress: (progress: number) => void
  ): Promise<void> => {
    try {
      let allFiles: string[] = [];
      
      // 收集所有檔案路徑
      for (const path of paths) {
        const fileInfo = files.find((f: FileInfo) => f.id === path);
        if (fileInfo) {
          if (fileInfo.isDirectory) {
            const folderFiles = await getFolderFiles(fileInfo.path);
            allFiles = [...allFiles, ...folderFiles];
          } else {
            allFiles.push(fileInfo.path);
          }
        }
      }

      const totalFiles = allFiles.length;
      let currentFileIndex = 0;

      for (const filePath of allFiles) {
        // 更新進度
        onProgress(Math.round((currentFileIndex / totalFiles) * 100));

        // 從檔案系統讀取檔案內容
        const fileResponse = await fetch(`${API_URL}/api/files/content/${filePath}`);
        if (!fileResponse.ok) {
          throw new Error(`無法讀取檔案 ${filePath}`);
        }
        const { content } = await fileResponse.json();

        // 加入知識庫
        const embedResponse = await fetch(`${API_URL}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: content,
            filename: filePath.split('/').pop() || 'file.txt',
            knowledge_base_id: knowledgeBaseId,
          }),
        });

        if (!embedResponse.ok) {
          throw new Error('加入知識庫失敗');
        }

        currentFileIndex++;
      }

      // 確保最後顯示 100%
      onProgress(100);
    } catch (error) {
      console.error('處理檔案時出錯:', error);
      throw error;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        currentMode={currentMode}
        onModeChange={setCurrentMode}
        chatSessions={chat.chatSessions}
        onLoadSession={chat.handleLoadSession}
        onDeleteSession={chat.handleDeleteSession}
        onCreateSession={() => 
          chat.createNewChatSession(knowledgeBase.currentKnowledgeBase)}
        translatedFiles={fileProcessing.translatedFiles}
      />

      <div className="flex-1 ml-64 p-6">
        {currentMode === "files" ? (
          <FileManager
            knowledgeBases={knowledgeBase.knowledgeBases}
            onBatchTranslateAndEmbed={handleBatchTranslateAndEmbed}
            onBatchEmbed={handleBatchEmbed}
            onModeChange={setCurrentMode}
            onFileChat={handleFileChat}
            files={files}  // 傳遞檔案列表
            onFilesChange={setFiles}  // 傳遞更新檔案列表的函數
          />
        ) : currentMode === "knowledge-base" ? (
          <KnowledgeBaseManager
            knowledgeBases={knowledgeBase.knowledgeBases}
            currentKnowledgeBase={knowledgeBase.currentKnowledgeBase}
            onCreateNew={knowledgeBase.createKnowledgeBase}
            onSwitch={knowledgeBase.setCurrentKnowledgeBase}
            onReset={knowledgeBase.resetKnowledgeBase}
            onDelete={knowledgeBase.deleteKnowledgeBase}
          />
        ) : currentMode === "chat" ? (
          <ChatMode
            chat={chat}
            knowledgeBase={knowledgeBase}
            modelSettings={modelSettings}
            onSettingsChange={setModelSettings}
          />
        ) : currentMode === "translated-files" ? (
          <TranslatedFilesView
            files={fileProcessing.translatedFiles}
            onDelete={fileProcessing.handleDelete}  // 直接使用 hook 提供的 handleDelete
            onDownload={handleDownloadTranslation}
          />
        ) : null}
      </div>
    </div>
  );
};

export default App;
