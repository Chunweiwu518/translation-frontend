// src/types.ts

export interface Message {
  sender: "user" | "system";
  text: string;
  chunks?: string[];
}

export interface TranslatedFile {
  id: string;
  name: string;
  originalContent: string;
  translatedContent: string;
  status: 'completed' | 'failed' | 'pending';
  isEmbedded?: boolean;
  embeddingProgress?: number;
  knowledgeBaseId?: string;
}

export interface ModelSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  seed: number;
  topK_model: number;
  topK_RAG: number;
  similarityThreshold: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  knowledgeBaseId: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
}

export interface ChatHook {
  messages: Message[];
  chatSessions: ChatSession[];
  currentSession: string | null;
  setMessages: (newMessages: Message[] | ((prev: Message[]) => Message[])) => void;
  setCurrentSession: (sessionId: string | null) => void;
  createNewChatSession: (knowledgeBaseId: string) => void;
  handleSendMessage: (text: string, knowledgeBaseId: string, modelSettings: ModelSettings) => Promise<void>;
  handleLoadSession: (sessionId: string) => void;
  handleDeleteSession: (sessionId: string) => void;
}

export interface FileProcessingHook {
  uploadProgress: {[key: string]: number};
  translatedFiles: TranslatedFile[];
  handleFileUpload: (files: FileWithMetadata[]) => Promise<void>;
  handleBatchEmbed: (fileIds: string[], targetKnowledgeBaseId: string) => Promise<void>;
  setTranslatedFiles: React.Dispatch<React.SetStateAction<TranslatedFile[]>>;
  handleDelete: (fileId: string) => Promise<void>;
}

export interface KnowledgeBaseHook {
  knowledgeBases: KnowledgeBase[];
  currentKnowledgeBase: string;
  setCurrentKnowledgeBase: (id: string) => void;
  createKnowledgeBase: (name: string, description: string) => Promise<void>;
  deleteKnowledgeBase: (id: string) => Promise<void>;
  resetKnowledgeBase: (id: string) => Promise<void>;
}

export interface ChatModeProps {
  chat: ChatHook;
  knowledgeBase: KnowledgeBaseHook;
  modelSettings: ModelSettings;
  onSettingsChange: (settings: ModelSettings) => void;
}

export interface ChatProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  currentKnowledgeBaseName: string;
  modelSettings: ModelSettings;
  onSettingsChange: (settings: ModelSettings) => void;
  knowledgeBases: KnowledgeBase[];
  currentKnowledgeBase: string;
  onSwitchKnowledgeBase: (id: string) => void;
  onCreateKnowledgeBase: (name: string, description: string) => void;
  onResetKnowledgeBase: (id: string) => void;
  onDeleteKnowledgeBase: (id: string) => void;
  onUploadAndEmbed: (file: File, needTranslation: boolean) => Promise<void>;
}

export interface FileInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  created_at: string;
  isDirectory: boolean;
}

export interface FileWithMetadata extends File {
  id?: string;
  needTranslation?: boolean;
}
