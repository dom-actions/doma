/**
 * IndexedDB 存储服务 - 管理聊天历史消息
 */

const DB_NAME = 'DOMA_ChatDB_v2';
const DB_VERSION = 1;
const STORE_CONVERSATIONS = 'conversations';
const STORE_MESSAGES = 'messages';
const INDEX_CONVERSATIONS_UPDATED_AT = 'updatedAt';
const INDEX_CONVERSATIONS_USER_ID = 'userId';

import type {
  ChatMessageToolBarItem,
  ChatMessageToolCall,
  TurnActivityTrace,
} from '../../components/chat/chatTypes';
import { LOCAL_USER_ID } from '../localUserId';
import { deleteSpecAssetsByConversation } from './specAssetStore';
import { deleteExtensionAssetsByConversation } from './extensionAssetStore';
import { deleteAgentSessionStoresByConversation } from './agentSessionStore';
import { deleteContextSpillsByConversation } from './contextSpillStore';

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  isProcess?: boolean;
  toolName?: string;
  groupId?: string;
  customUi?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  timestamp: number;
  toolBarItems?: ChatMessageToolBarItem[];
  toolCalls?: ChatMessageToolCall[];
  activityTrace?: TurnActivityTrace;
}

export interface StoredConversation {
  id: string;
  userId: string;
  title: string;
  /** 首条用户消息，创建时写入，历史列表展示用 */
  firstUserMessage?: string;
  /** 会话关联页面的 URL，历史列表展示 hostname 时从中解析 */
  url?: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredConversationUpdate {
  title?: string;
  url?: string;
}

/** 与 ChatPanel 一致的消息 id 格式 */
export function newChatMessageId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `msg-${crypto.randomUUID()}`
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

class ChatStorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[ChatStorage] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[ChatStorage] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        console.log('[ChatStorage] Initializing database...');

        const convStore = db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
        convStore.createIndex(INDEX_CONVERSATIONS_UPDATED_AT, 'updatedAt', { unique: false });
        convStore.createIndex(INDEX_CONVERSATIONS_USER_ID, 'userId', { unique: false });

        const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
        msgStore.createIndex('timestamp', 'timestamp', { unique: false });
      };
    });

    return this.initPromise;
  }

  private async ensureDb(): Promise<IDBDatabase> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  // ========== 会话操作 ==========

  async createConversation(
    id: string,
    provider: string,
    title?: string,
    url?: string,
  ): Promise<StoredConversation> {
    const db = await this.ensureDb();
    const now = Date.now();
    const normalizedUrl = url?.trim() || undefined;
    const userId = LOCAL_USER_ID;
    const conversation: StoredConversation = {
      id,
      title: title || `对话 ${new Date(now).toLocaleString()}`,
      firstUserMessage: title,
      url: normalizedUrl,
      provider,
      createdAt: now,
      updatedAt: now,
      userId,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.put(conversation);

      request.onsuccess = () => resolve(conversation);
      request.onerror = () => reject(request.error);
    });
  }

  async getConversation(id: string): Promise<StoredConversation | undefined> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONVERSATIONS, 'readonly');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllConversations(): Promise<StoredConversation[]> {
    const db = await this.ensureDb();
    const userId = LOCAL_USER_ID;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONVERSATIONS, 'readonly');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const index = store.index(INDEX_CONVERSATIONS_USER_ID);
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const conversations = (request.result as StoredConversation[]).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
        resolve(conversations);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 搜索历史会话：匹配 title / firstUserMessage / provider，可选搜索消息正文。
   * query 为空时等价于 getAllConversations()。
   * 匹配时忽略 interactionBlock 内文（列表展示同源规则）；消息存储原文不变。
   */
  async searchConversations(
    query: string,
    options?: { includeMessages?: boolean },
  ): Promise<StoredConversation[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.getAllConversations();

    const includeMessages = options?.includeMessages !== false;
    const all = await this.getAllConversations();
    const matched: StoredConversation[] = [];

    for (const conv of all) {
      if (this.conversationMetadataMatchesQuery(conv, q)) {
        matched.push(conv);
        continue;
      }
      if (!includeMessages) continue;

      const messages = await this.getMessagesByConversation(conv.id);
      const hit = messages.some((m) => this.messageContentMatchesQuery(m.content, q));
      if (hit) matched.push(conv);
    }

    return matched;
  }

  private stripInteractionBlocksForSearch(text: string): string {
    return String(text || "")
      .replace(/<interactionBlock\b[^>]*>[\s\S]*?<\/interactionBlock>/gi, "")
      .trim();
  }

  private messageContentMatchesQuery(content: string, q: string): boolean {
    const visible = this.stripInteractionBlocksForSearch(content).toLowerCase();
    if (visible.includes(q)) return true;
    // 纯 interactionBlock、块外无正文时：不按块内提示词命中（避免搜到「primarySubject」等）
    return false;
  }

  private conversationMetadataMatchesQuery(conv: StoredConversation, q: string): boolean {
    const title = this.stripInteractionBlocksForSearch(conv.title).toLowerCase();
    const first = this.stripInteractionBlocksForSearch(conv.firstUserMessage || "").toLowerCase();
    return (
      title.includes(q) ||
      first.includes(q) ||
      (conv.url?.toLowerCase().includes(q) ?? false) ||
      conv.provider.toLowerCase().includes(q)
    );
  }

  async updateConversation(id: string, patch: StoredConversationUpdate): Promise<void> {
    const db = await this.ensureDb();
    const conversation = await this.getConversation(id);
    if (!conversation) return;

    if (patch.title !== undefined) {
      conversation.title = patch.title;
    }
    if (patch.url !== undefined) {
      const normalizedUrl = patch.url.trim();
      if (normalizedUrl) {
        conversation.url = normalizedUrl;
      }
    }
    conversation.updatedAt = Date.now();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.put(conversation);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateConversationTitle(id: string, title: string, url?: string): Promise<void> {
    return this.updateConversation(id, { title, url });
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.ensureDb();

    // 先删除该会话的所有消息
    await this.deleteMessagesByConversation(id);

    try {
      await deleteSpecAssetsByConversation(id);
    } catch (e) {
      console.warn("[chatStorage] deleteSpecAssetsByConversation failed:", e);
    }

    try {
      await deleteExtensionAssetsByConversation(id);
    } catch (e) {
      console.warn("[chatStorage] deleteExtensionAssetsByConversation failed:", e);
    }

    try {
      await deleteAgentSessionStoresByConversation(id);
    } catch (e) {
      console.warn("[chatStorage] deleteAgentSessionStoresByConversation failed:", e);
    }

    try {
      await deleteContextSpillsByConversation(id);
    } catch (e) {
      console.warn("[chatStorage] deleteContextSpillsByConversation failed:", e);
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 将 fromId 下的消息复制到 toId（新 message.id），原会话记录保留。
   * @returns 实际复制的消息条数
   */
  async migrateConversationMessages(fromId: string, toId: string): Promise<number> {
    const messages = await this.getMessagesByConversation(fromId);
    if (messages.length === 0) return 0;

    const db = await this.ensureDb();
    const copies: StoredMessage[] = messages.map((message) => ({
      ...message,
      id: newChatMessageId(),
      conversationId: toId,
    }));

    const lastTimestamp = copies[copies.length - 1]?.timestamp ?? Date.now();
    const conversation = await this.getConversation(toId);
    if (conversation) {
      conversation.updatedAt = Math.max(conversation.updatedAt, lastTimestamp);
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_MESSAGES, STORE_CONVERSATIONS], 'readwrite');
      const msgStore = tx.objectStore(STORE_MESSAGES);
      for (const copy of copies) {
        msgStore.put(copy);
      }
      if (conversation) {
        tx.objectStore(STORE_CONVERSATIONS).put(conversation);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return copies.length;
  }

  async addMessage(message: Omit<StoredMessage, 'timestamp'>): Promise<StoredMessage> {
    const db = await this.ensureDb();
    const storedMessage: StoredMessage = {
      ...message,
      timestamp: Date.now(),
    };

    // 更新会话的 updatedAt
    const conversation = await this.getConversation(message.conversationId);
    if (conversation) {
      conversation.updatedAt = storedMessage.timestamp;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
        const store = tx.objectStore(STORE_CONVERSATIONS);
        const request = store.put(conversation);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.put(storedMessage);

      request.onsuccess = () => resolve(storedMessage);
      request.onerror = () => reject(request.error);
    });
  }

  async getMessagesByConversation(conversationId: string): Promise<StoredMessage[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('conversationId');
      const request = index.getAll(conversationId);

      request.onsuccess = () => {
        // 按时间戳排序
        const messages = (request.result as StoredMessage[]).sort((a, b) => a.timestamp - b.timestamp);
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getMessage(id: string): Promise<StoredMessage | undefined> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result as StoredMessage | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 原地更新一条消息（保持原 timestamp 不变，避免重排）。
   * 仅更新提供的字段；conversation.updatedAt 会更新为当前时间。
   */
  async updateMessage(
    id: string,
    patch: Partial<
      Pick<
        StoredMessage,
        | 'content'
        | 'isProcess'
        | 'toolName'
        | 'groupId'
        | 'customUi'
        | 'toolInput'
        | 'toolBarItems'
        | 'toolCalls'
      >
    >,
  ): Promise<boolean> {
    const db = await this.ensureDb();
    const existing = await this.getMessage(id);
    if (!existing) return false;
    const updated: StoredMessage = { ...existing, ...patch };

    // 更新会话的 updatedAt（但不改消息 timestamp）
    const conv = await this.getConversation(existing.conversationId);
    if (conv) {
      conv.updatedAt = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
        const store = tx.objectStore(STORE_CONVERSATIONS);
        const req = store.put(conv);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.put(updated);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return true;
  }

  async deleteMessage(id: string): Promise<boolean> {
    const db = await this.ensureDb();
    const existing = await this.getMessage(id);
    if (!existing) return false;

    const conv = await this.getConversation(existing.conversationId);
    if (conv) {
      conv.updatedAt = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CONVERSATIONS, "readwrite");
        const store = tx.objectStore(STORE_CONVERSATIONS);
        const req = store.put(conv);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readwrite");
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return true;
  }

  async deleteMessagesByConversation(conversationId: string): Promise<void> {
    const db = await this.ensureDb();
    const messages = await this.getMessagesByConversation(conversationId);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);

      let completed = 0;
      const total = messages.length;

      if (total === 0) {
        resolve();
        return;
      }

      for (const msg of messages) {
        const request = store.delete(msg.id);
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      }
    });
  }

  // ========== 清理操作 ==========

  async clearAllData(): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONVERSATIONS, STORE_MESSAGES], 'readwrite');
      
      tx.objectStore(STORE_CONVERSATIONS).clear();
      tx.objectStore(STORE_MESSAGES).clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// 单例导出
export const chatStorage = new ChatStorageService();
