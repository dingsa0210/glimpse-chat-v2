import type { MessagePayload } from "@glimpse/shared";

const DATABASE_NAME = "glimpse-chat-offline";
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "workspaceSnapshots";
const MAX_CACHED_CONVERSATIONS = 200;
const MAX_CACHED_MESSAGES_PER_CONVERSATION = 150;

export type OfflineWorkspaceSnapshot<TConversation> = {
  userId: string;
  conversations: TConversation[];
  messagesByConversation: Record<string, MessagePayload[]>;
  updatedAt: number;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the offline chat database."));
  });
}

export async function readOfflineWorkspace<TConversation>(userId: string) {
  if (!userId) return null;
  try {
    const database = await openDatabase();
    return await new Promise<OfflineWorkspaceSnapshot<TConversation> | null>((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
      const request = transaction.objectStore(SNAPSHOT_STORE).get(userId);
      request.onsuccess = () => resolve((request.result as OfflineWorkspaceSnapshot<TConversation> | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read cached chats."));
      transaction.oncomplete = () => database.close();
      transaction.onabort = () => database.close();
      transaction.onerror = () => database.close();
    });
  } catch {
    return null;
  }
}

export async function writeOfflineWorkspace<TConversation>(
  userId: string,
  conversations: TConversation[],
  messagesByConversation: Record<string, MessagePayload[]>
) {
  if (!userId) return;
  try {
    const cachedConversations = conversations.slice(0, MAX_CACHED_CONVERSATIONS);
    const conversationIds = new Set(
      cachedConversations
        .map((conversation) => (conversation as { id?: unknown }).id)
        .filter((id): id is string => typeof id === "string" && Boolean(id))
    );
    const cachedMessages = Object.fromEntries(
      Object.entries(messagesByConversation)
        .filter(([conversationId]) => conversationIds.has(conversationId))
        .map(([conversationId, messages]) => [conversationId, messages.slice(-MAX_CACHED_MESSAGES_PER_CONVERSATION)])
    );
    const snapshot: OfflineWorkspaceSnapshot<TConversation> = {
      userId,
      conversations: cachedConversations,
      messagesByConversation: cachedMessages,
      updatedAt: Date.now()
    };
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
      transaction.objectStore(SNAPSHOT_STORE).put(snapshot);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("Could not cache chats."));
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("Could not cache chats."));
      };
    });
  } catch {
    // Offline caching is best-effort and must never interrupt chat rendering.
  }
}

export async function clearOfflineWorkspace(userId: string) {
  if (!userId) return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
      transaction.objectStore(SNAPSHOT_STORE).delete(userId);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("Could not clear cached chats."));
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("Could not clear cached chats."));
      };
    });
  } catch {
    // Explicit logout still succeeds if browser storage is unavailable.
  }
}

export function requestPersistentOfflineStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
  void navigator.storage.persist().catch(() => undefined);
}
