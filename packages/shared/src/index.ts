export const GLIMPSE_CHAT_VERSION = "v32.97.152";

export type UserLanguage = "zh" | "en";
export type UserRole = "user" | "admin";
export type AdminPermission = "overview" | "users" | "user_chats" | "conversations" | "feedback" | "settings" | "admins";

export const ADMIN_PERMISSION_OPTIONS: Array<{ code: AdminPermission; label: string; zhLabel: string; hiLabel: string }> = [
  { code: "overview", label: "Dashboard overview", zhLabel: "后台概览", hiLabel: "डैशबोर्ड अवलोकन" },
  { code: "users", label: "User management", zhLabel: "用户管理", hiLabel: "उपयोगकर्ता प्रबंधन" },
  { code: "user_chats", label: "User chat history", zhLabel: "聊天记录查看", hiLabel: "उपयोगकर्ता चैट इतिहास" },
  { code: "conversations", label: "Conversation list", zhLabel: "会话列表", hiLabel: "बातचीत सूची" },
  { code: "feedback", label: "Feedback queue", zhLabel: "反馈处理", hiLabel: "फीडबैक कतार" },
  { code: "settings", label: "System settings", zhLabel: "系统配置", hiLabel: "सिस्टम सेटिंग्स" },
  { code: "admins", label: "Administrator accounts", zhLabel: "管理员账户", hiLabel: "एडमिन खाते" }
];

export type TranslationLanguage =
  | "zh"
  | "en"
  | "hi"
  | "ar"
  | "bn"
  | "de"
  | "es"
  | "fr"
  | "id"
  | "it"
  | "ja"
  | "ko"
  | "ms"
  | "nl"
  | "pt"
  | "ru"
  | "ta"
  | "te"
  | "th"
  | "tr"
  | "ur"
  | "vi";

export type TranslationSourceLanguage = "auto" | TranslationLanguage;

export type TranslationLanguageOption = {
  code: TranslationLanguage;
  label: string;
  nativeLabel: string;
};

export const TRANSLATION_LANGUAGE_OPTIONS: TranslationLanguageOption[] = [
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "id", label: "Indonesian", nativeLabel: "Indonesia" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "ms", label: "Malay", nativeLabel: "Melayu" },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" }
];

export const SUPPORTED_TRANSLATION_LANGUAGES = TRANSLATION_LANGUAGE_OPTIONS.map((item) => item.code);

export type ConversationType = "direct" | "group";

export type MessageType = "text" | "image" | "video" | "audio" | "file";

export interface PublicUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  publicId?: string | null;
  publicIdUpdatedAt?: string | null;
  profilePublic?: boolean | null;
  profileEmailPublic?: boolean | null;
  profilePhonePublic?: boolean | null;
  nickname: string;
  avatarUrl?: string | null;
  company?: string | null;
  title?: string | null;
  location?: string | null;
  bio?: string | null;
  signature?: string | null;
  language: UserLanguage;
  role?: UserRole;
  isSuperAdmin?: boolean;
  adminPermissions?: AdminPermission[];
  online?: boolean;
}

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  title: string;
  avatarUrl?: string;
  announcement?: string | null;
  announcementScroll?: boolean | null;
  ownerId?: string | null;
  memberCount?: number;
  otherUser?: PublicUser & { email?: string | null; phone?: string | null };
  latestMessage?: string;
  latestMessageAt?: string;
  unreadCount: number;
  online?: boolean;
}

export interface GroupMemberSummary {
  id: string;
  user: PublicUser & { email?: string | null; phone?: string | null };
  joinedAt: string;
  invitedById?: string | null;
  invitedBy?: (PublicUser & { email?: string | null; phone?: string | null }) | null;
  isOwner: boolean;
  isAdmin: boolean;
}

export interface ManualTranslationRevision {
  body: string;
  editedById: string;
  editedByName: string;
  editedAt: string;
}

export interface ManualTranslation extends ManualTranslationRevision {
  originalBody?: string;
  revisions?: ManualTranslationRevision[];
}

export interface MessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  type: MessageType;
  body?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaSizeBytes?: number;
  transcript?: string;
  revokedAt?: string;
  replyToMessageId?: string;
  replyToMessageSenderName?: string;
  replyToMessageType?: MessageType;
  replyToMessageBody?: string;
  sourceLanguage?: TranslationSourceLanguage;
  targetLanguage?: TranslationLanguage;
  translations?: Partial<Record<TranslationLanguage, string>>;
  manualTranslations?: Partial<Record<TranslationLanguage, ManualTranslation>>;
  albumId?: string;
  albumIndex?: number;
  albumSize?: number;
  createdAt: string;
}

export interface ConversationHistoryResponse {
  conversationId: string;
  messages: MessagePayload[];
  nextCursor?: string;
}


export type UploadMediaKind = "image" | "video" | "audio" | "file";

export interface UploadedMediaResponse {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: UploadMediaKind;
}

export interface ArchivePreviewEntry {
  name: string;
  size: number;
  compressedSize: number;
  directory: boolean;
}

export interface ArchivePreviewResponse {
  fileName: string;
  totalEntries: number;
  entries: ArchivePreviewEntry[];
  truncated: boolean;
}

export type DocumentPreviewKind = "pdf" | "svg" | "image" | "text" | "html" | "spreadsheet" | "presentation" | "unsupported";

export interface DocumentPreviewResponse {
  fileName: string;
  mimeType: string;
  kind: DocumentPreviewKind;
  url?: string;
  content?: string;
  warning?: string;
  engine?: string;
}

export type OfficeConversionFormat = "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp";

export interface OfficeConversionRequest {
  format: OfficeConversionFormat;
  fileName?: string;
}

export const MEDIA_LIMITS = {
  imageMaxBytes: 500 * 1024 * 1024,
  videoMaxBytes: 500 * 1024 * 1024,
  videoMaxSeconds: 5 * 60,
  audioMaxBytes: 500 * 1024 * 1024,
  fileMaxBytes: 500 * 1024 * 1024
} as const;

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const ALLOWED_AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/webm", "audio/ogg"] as const;
export const ALLOWED_FILE_MIME_TYPES = ["application/pdf", "text/plain", "text/csv", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "image/vnd.dxf", "image/vnd.dwg", "application/acad", "application/x-caxa-exb"] as const;
export const ALLOWED_MEDIA_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES, ...ALLOWED_AUDIO_MIME_TYPES, ...ALLOWED_FILE_MIME_TYPES] as const;
export const SUPPORTED_LANGUAGES: UserLanguage[] = ["zh", "en"];
export interface AuthResponse {
  accessToken: string;
  user: PublicUser & {
    email?: string | null;
    phone?: string | null;
  };
}


export type CallMediaKind = "audio" | "video";
export type CallSignalType = "join" | "offer" | "answer" | "ice-candidate" | "camera-state" | "end" | "reject" | "busy";

export interface CallSignalPayload {
  conversationId: string;
  callId: string;
  media: CallMediaKind;
  signalType: CallSignalType;
  participantUserIds?: string[];
  targetUserId?: string;
  sdp?: string;
  candidate?: unknown;
  reason?: string;
  cameraOff?: boolean;
}

export interface CallSignalEvent extends CallSignalPayload {
  fromUserId: string;
  fromName?: string;
  createdAt: string;
}


















































































