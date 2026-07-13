import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

export type RuntimeSettingDefinition = {
  key: string;
  label: string;
  group: string;
  description: string;
  sensitive?: boolean;
  restartRequired?: boolean;
  bootstrapOnly?: boolean;
  defaultValue?: string;
  options?: Array<{ value: string; label: string; description?: string }>;
};

const TOOL_OPTIONS = {
  translationProvider: [
    { value: "mock", label: "Mock", description: "Only for local placeholder testing." },
    { value: "baidu", label: "Baidu General", description: "Baidu general translation." },
    { value: "baidu_cloud", label: "Baidu Cloud", description: "Baidu Intelligent Cloud machine translation." },
    { value: "aliyun_qwen", label: "Aliyun Qwen", description: "Qwen model translation through Aliyun Model Studio." }
  ],
  voiceTranscribeProvider: [
    { value: "doubao", label: "Doubao ASR", description: "Doubao recording file recognition 2.0." },
    { value: "aliyun", label: "Aliyun ASR", description: "Aliyun qwen3-asr-flash compatible path." }
  ],
  aliyunAsrMode: [
    { value: "auto", label: "Auto" },
    { value: "file_upload", label: "File upload" },
    { value: "chat_audio_url", label: "Public audio URL" }
  ],
  voiceTranslateProvider: [
    { value: "aliyun_qwen", label: "Aliyun Qwen" },
    { value: "baidu_cloud", label: "Baidu Cloud" },
    { value: "baidu", label: "Baidu General" }
  ],
  ttsProvider: [
    { value: "browser", label: "Browser TTS", description: "Use the device/browser built-in speech synthesis." },
    { value: "doubao", label: "Doubao TTS", description: "Use Doubao cloud voice after the TTS adapter is enabled." }
  ]
} satisfies Record<string, Array<{ value: string; label: string; description?: string }>>;
export const RUNTIME_SETTING_DEFINITIONS: RuntimeSettingDefinition[] = [
  { key: "DATABASE_URL", label: "Database URL", group: "Bootstrap", description: "数据库连接地址。应用必须先靠 .env 连上数据库后，后台配置才能读取。", sensitive: true, restartRequired: true, bootstrapOnly: true },
  { key: "JWT_ACCESS_SECRET", label: "JWT access secret", group: "Bootstrap", description: "登录令牌签名密钥。修改后需要重启，并会影响已登录设备。", sensitive: true, restartRequired: true },
  { key: "JWT_ACCESS_TTL", label: "JWT access TTL", group: "Bootstrap", description: "登录有效期，例如 7d。", restartRequired: true },
  { key: "ADMIN_EMAILS", label: "Bootstrap admin emails", group: "Admin", description: "启动级管理员邮箱白名单。新管理员建议在后台账户权限中维护。", restartRequired: true },
  { key: "TRANSLATION_PROVIDER", label: "Translation provider", group: "Translation", description: "翻译提供方：mock、baidu、baidu_cloud、aliyun_qwen。", options: TOOL_OPTIONS.translationProvider, defaultValue: "baidu_cloud" },
  { key: "BAIDU_TRANSLATE_APP_ID", label: "Baidu translate AppID", group: "Translation", description: "百度通用翻译 AppID。", sensitive: true },
  { key: "BAIDU_TRANSLATE_SECRET", label: "Baidu translate secret", group: "Translation", description: "百度通用翻译密钥。", sensitive: true },
  { key: "BAIDU_TRANSLATE_API_KEY", label: "Baidu cloud API Key", group: "Translation", description: "百度智能云机器翻译 API Key。", sensitive: true },
  { key: "BAIDU_TRANSLATE_SECRET_KEY", label: "Baidu cloud Secret Key", group: "Translation", description: "百度智能云机器翻译 Secret Key。", sensitive: true },
  { key: "TRANSLATION_CACHE_TTL_SECONDS", label: "Translation cache TTL", group: "Translation", description: "翻译缓存秒数。" },
  { key: "TRANSLATION_CACHE_MAX_ENTRIES", label: "Translation cache max entries", group: "Translation", description: "翻译缓存最大条数。" },
  { key: "TRANSLATION_MAX_REQUESTS_PER_MINUTE", label: "Translation rate limit", group: "Translation", description: "每分钟最多翻译请求数。" },
  { key: "CHAT_STORAGE", label: "Chat storage", group: "Storage", description: "聊天存储方式，当前建议 prisma。", restartRequired: true },
  { key: "MEDIA_STORAGE_DIR", label: "Media storage directory", group: "Storage", description: "本地媒体上传目录。修改后新上传文件使用新目录。" },
  { key: "NEXT_PUBLIC_API_URL", label: "Public API URL", group: "Public URLs", description: "前端访问 API 的公网地址。前端构建变量通常需要重启/重新构建。", restartRequired: true },
  { key: "NEXT_PUBLIC_SOCKET_URL", label: "Public socket URL", group: "Public URLs", description: "前端实时服务地址。前端构建变量通常需要重启/重新构建。", restartRequired: true },
  { key: "PUBLIC_WEB_URL", label: "Public web URL", group: "Public URLs", description: "外部访问网页地址，用于通知或分享。" },
  { key: "SMTP_HOST", label: "SMTP host", group: "Email", description: "邮件服务器地址。" },
  { key: "SMTP_PORT", label: "SMTP port", group: "Email", description: "邮件服务器端口。" },
  { key: "SMTP_USER", label: "SMTP user", group: "Email", description: "邮件发送账号。", sensitive: true },
  { key: "SMTP_PASSWORD", label: "SMTP password", group: "Email", description: "邮件发送密码。", sensitive: true },
  { key: "SMS_PROVIDER", label: "SMS provider", group: "SMS", description: "短信服务商。" },
  { key: "SMS_ACCESS_KEY_ID", label: "SMS access key", group: "SMS", description: "短信服务 AccessKey。", sensitive: true },
  { key: "SMS_ACCESS_KEY_SECRET", label: "SMS secret", group: "SMS", description: "短信服务 Secret。", sensitive: true },
  { key: "ALIYUN_ACCESS_KEY_ID", label: "Aliyun access key", group: "Aliyun", description: "阿里云 AccessKey ID，用于传统云产品接口；不要填写 DashScope API Key。", sensitive: true },
  { key: "ALIYUN_ACCESS_KEY_SECRET", label: "Aliyun secret", group: "Aliyun", description: "阿里云 AccessKey Secret，用于传统云产品接口；不要填写 DashScope API Key。", sensitive: true },
  { key: "ALIYUN_DASHSCOPE_API_KEY", label: "DashScope API Key", group: "Aliyun Model Studio", description: "阿里云百炼 / DashScope API Key，用于语音识别和 Qwen 翻译。", sensitive: true },
  { key: "ALIYUN_DASHSCOPE_BASE_URL", label: "DashScope base URL", group: "Aliyun Model Studio", description: "DashScope OpenAI compatible base URL。", defaultValue: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { key: "VOICE_TRANSCRIBE_PROVIDER", label: "Voice transcription provider", group: "Aliyun Model Studio", description: "语音转文字服务商：aliyun 或 doubao。当前豆包录音文件识别 2.0 可选 doubao。", defaultValue: "doubao", options: TOOL_OPTIONS.voiceTranscribeProvider },
  { key: "ALIYUN_ASR_MODEL", label: "Aliyun ASR model", group: "Aliyun Model Studio", description: "语音转文字模型。当前建议 qwen3-asr-flash。", defaultValue: "qwen3-asr-flash" },
  { key: "ALIYUN_ASR_API_KEY", label: "Aliyun ASR API Key", group: "Aliyun Model Studio", description: "Optional dedicated ASR API Key. If empty, DashScope API Key is used.", sensitive: true },
  { key: "ALIYUN_ASR_BASE_URL", label: "Aliyun ASR base URL", group: "Aliyun Model Studio", description: "Optional dedicated ASR OpenAI-compatible base URL. If empty, DashScope base URL is used." },
  { key: "ALIYUN_ASR_REQUEST_MODE", label: "Aliyun ASR request mode", group: "Aliyun Model Studio", description: "ASR request mode: auto, file_upload, or chat_audio_url. Current qwen3-asr-flash provider usually requires chat_audio_url with a public HTTPS media URL.", defaultValue: "auto", options: TOOL_OPTIONS.aliyunAsrMode },
  { key: "PUBLIC_MEDIA_BASE_URL", label: "Public media base URL", group: "Public URLs", description: "Public HTTPS API/media base URL used by cloud ASR providers to download voice files, for example https://chat.example.com." },
  { key: "ALIYUN_TRANSLATE_MODEL", label: "Aliyun default translate model", group: "Aliyun Model Studio", description: "默认聊天翻译模型。当前建议 qwen3.7-plus。", defaultValue: "qwen3.7-plus" },
  { key: "ALIYUN_TRANSLATE_MODEL_HIGH_QUALITY", label: "Aliyun high quality translate model", group: "Aliyun Model Studio", description: "高质量翻译模型。当前建议 qwen3.7-max。", defaultValue: "qwen3.7-max" },
  { key: "VOICE_TRANSLATE_PROVIDER", label: "Voice transcript translation provider", group: "Aliyun Model Studio", description: "Provider for translating voice transcripts. Current default: aliyun_qwen.", defaultValue: "aliyun_qwen", options: TOOL_OPTIONS.voiceTranslateProvider },
  { key: "TTS_PROVIDER", label: "Text-to-speech provider", group: "Speech", description: "朗读服务商：browser 使用浏览器内置朗读；doubao 使用豆包云端音色。", defaultValue: "browser", options: TOOL_OPTIONS.ttsProvider },
  { key: "DOUBAO_API_KEY", label: "Doubao API Key", group: "Speech", description: "Shared Doubao key fallback. Prefer dedicated ASR/TTS keys when possible.", sensitive: true },
  { key: "DOUBAO_TTS_API_KEY", label: "Doubao TTS API Key", group: "Speech", description: "X-Api-Key for Doubao text-to-speech. If empty, DOUBAO_API_KEY is used as fallback.", sensitive: true },
  { key: "DOUBAO_ASR_API_KEY", label: "Doubao ASR API Key", group: "Speech", description: "X-Api-Key for Doubao recording file recognition. If empty, DOUBAO_API_KEY is used as fallback.", sensitive: true },
  { key: "DOUBAO_ASR_MODEL", label: "Doubao ASR Resource-Id", group: "Speech", description: "Doubao speech-to-text Resource-Id. Use volc.seedasr.auc for Doubao recording file recognition 2.0; do not use TTS Resource-Id seed-tts-2.0 here.", defaultValue: "volc.seedasr.auc" },
  { key: "DOUBAO_ASR_BASE_URL", label: "Doubao ASR submit URL", group: "Speech", description: "Doubao recording file recognition submit endpoint.", defaultValue: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit" },
  { key: "DOUBAO_ASR_QUERY_URL", label: "Doubao ASR query URL", group: "Speech", description: "Doubao recording file recognition query endpoint.", defaultValue: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query" },
  { key: "DOUBAO_BASE_URL", label: "Doubao base URL", group: "Speech", description: "通用豆包语音 Base URL。TTS 当前使用 HTTP POST；如果误填 wss stream 地址，后端会自动转为 HTTP unidirectional 地址。", defaultValue: "https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional" },
  { key: "DOUBAO_TTS_BASE_URL", label: "Doubao TTS HTTP URL", group: "Speech", description: "可选。豆包朗读专用 HTTP POST 地址，默认 https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional。不要填 WebSocket stream 地址。", defaultValue: "https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional" },
  { key: "DOUBAO_TTS_MODEL", label: "Doubao TTS Resource-Id", group: "Speech", description: "Doubao read-aloud Resource-Id. Use seed-tts-2.0 for message reading; do not use ASR Resource-Id volc.seedasr.auc here.", defaultValue: "seed-tts-2.0" },
  { key: "DOUBAO_TTS_VOICE", label: "Doubao TTS voice", group: "Speech", description: "默认豆包朗读音色/voice_type。前台切换为豆包朗读后会显示豆包音色下拉。", defaultValue: "zh_female_wanwanxiaohe_moon_bigtts" },
  { key: "DOUBAO_TTS_VOICES_JSON", label: "Doubao TTS voices JSON", group: "Speech", description: "可维护豆包音色列表 JSON，例如 [{value:\"voice_type\",label:\"音色名\"}]。留空时使用内置常用音色。" },
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek API Key", group: "AI", description: "预留给后续大模型能力。", sensitive: true }
];

function maskValue(value: string | null | undefined) {
  if (!value) return "";
  if (value.length <= 6) return "******";
  return `${value.slice(0, 3)}******${value.slice(-3)}`;
}

@Injectable()
export class SystemConfigService {
  private readonly cache = new Map<string, { value: string; expiresAt: number }>();
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  get definitions() {
    return RUNTIME_SETTING_DEFINITIONS;
  }

  async get(key: string, fallback = "") {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const row = await this.prisma.systemSetting.findUnique({ where: { key } }).catch(() => null);
    const definitionDefault = this.definitions.find((item) => item.key === key)?.defaultValue ?? "";
    const configFallback = fallback || definitionDefault;
    const value = row?.value ?? this.config.get<string>(key, configFallback) ?? configFallback;
    this.cache.set(key, { value, expiresAt: Date.now() + 15_000 });
    return value;
  }

  async getNumber(key: string, fallback: number) {
    const raw = (await this.get(key, String(fallback))).trim();
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  async listForAdmin() {
    const rows = await this.prisma.systemSetting.findMany().catch(() => []);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return this.definitions.map((definition) => {
      const stored = byKey.get(definition.key);
      const envValue = this.config.get<string>(definition.key, "") ?? "";
      const defaultValue = definition.defaultValue ?? "";
      const value = (stored?.value ?? envValue) || defaultValue;
      return {
        ...definition,
        value: definition.sensitive ? "" : value,
        maskedValue: definition.sensitive ? maskValue(value) : "",
        hasValue: Boolean(value),
        source: stored ? "admin" : envValue ? "env" : defaultValue ? "default" : "empty",
        updatedAt: stored?.updatedAt.toISOString() ?? null,
        activeOptionLabel: definition.options?.find((option) => option.value === value)?.label ?? null,
        updatedById: stored?.updatedById ?? null
      };
    });
  }

  async updateFromAdmin(items: Array<{ key?: string; value?: string | null }>, actorId: string) {
    const allowed = new Map(this.definitions.map((item) => [item.key, item]));
    for (const item of items) {
      const key = String(item.key ?? "").trim();
      if (!allowed.has(key)) continue;
      const definition = allowed.get(key)!;
      const rawValue = item.value;
      if (definition.sensitive && (rawValue === undefined || rawValue === null || rawValue === "")) continue;
      const value = rawValue === null ? null : String(rawValue ?? "").trim();
      if (value && definition.options?.length && !definition.options.some((option) => option.value === value)) {
        throw new BadRequestException(`${definition.label} can only be one of: ${definition.options.map((option) => option.value).join(", ")}.`);
      }
      await this.prisma.systemSetting.upsert({
        where: { key },
        update: { value, sensitive: Boolean(definition.sensitive), description: definition.description, updatedById: actorId },
        create: { key, value, sensitive: Boolean(definition.sensitive), description: definition.description, updatedById: actorId }
      });
      this.cache.delete(key);
    }
    return this.listForAdmin();
  }
}













