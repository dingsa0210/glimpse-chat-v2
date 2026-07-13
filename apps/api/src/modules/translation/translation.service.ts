import { TRANSLATION_LANGUAGE_OPTIONS, type TranslationLanguage, type TranslationSourceLanguage } from "@glimpse/shared";
import { createHash, randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SystemConfigService } from "../system-config/system-config.service";

type TranslationProvider = "mock" | "baidu" | "baidu_cloud" | "aliyun_qwen";

type CachedTranslation = { value: string; expiresAt: number; lastUsedAt: number };

type BaiduTranslateResponse = {
  from?: string;
  to?: string;
  trans_result?: Array<{ src: string; dst: string }>;
  error_code?: string;
  error_msg?: string;
};

type BaiduCloudTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type BaiduCloudTranslateResponse = {
  result?: {
    trans_result?: Array<{ src?: string; dst?: string }>;
    translated_text?: string;
    dst?: string;
  };
  trans_result?: Array<{ src?: string; dst?: string }>;
  translated_text?: string;
  dst?: string;
  error_code?: number | string;
  error_msg?: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output?: { text?: string };
  text?: string;
  error?: { message?: string };
  message?: string;
};

const baiduLanguageCodes: Record<TranslationSourceLanguage, string> = {
  auto: "auto",
  zh: "zh",
  en: "en",
  hi: "hi",
  ar: "ar",
  bn: "bn",
  de: "de",
  es: "spa",
  fr: "fra",
  id: "id",
  it: "it",
  ja: "jp",
  ko: "kor",
  ms: "may",
  nl: "nl",
  pt: "pt",
  ru: "ru",
  ta: "tam",
  te: "tel",
  th: "th",
  tr: "tr",
  ur: "urd",
  vi: "vie"
};

const languageScriptPatterns: Partial<Record<TranslationLanguage, RegExp>> = {
  zh: /[\u3400-\u9fff]/,
  hi: /[\u0900-\u097f]/,
  ar: /[\u0600-\u06ff]/,
  ur: /[\u0600-\u06ff]/,
  bn: /[\u0980-\u09ff]/,
  ja: /[\u3040-\u30ff]/,
  ko: /[\uac00-\ud7af]/,
  ru: /[\u0400-\u04ff]/,
  ta: /[\u0b80-\u0bff]/,
  te: /[\u0c00-\u0c7f]/,
  th: /[\u0e00-\u0e7f]/
};

function appearsToAlreadyBeTargetLanguage(text: string, targetLanguage: TranslationLanguage) {
  const pattern = languageScriptPatterns[targetLanguage];
  return pattern ? pattern.test(text) : false;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private baiduCloudAccessToken = "";
  private baiduCloudAccessTokenExpiresAt = 0;
  private readonly translationCache = new Map<string, CachedTranslation>();
  private readonly inFlightTranslations = new Map<string, Promise<string>>();
  private translationWindowStartedAt = 0;
  private translationWindowCount = 0;

  constructor(private readonly config: ConfigService, private readonly runtimeConfig: SystemConfigService) {}

  async translateText(text: string, from: TranslationSourceLanguage, to: TranslationLanguage) {
    const trimmed = text.trim();
    if (!trimmed || from === to || appearsToAlreadyBeTargetLanguage(trimmed, to)) return "";

    const provider = (await this.runtimeConfig.get("TRANSLATION_PROVIDER", this.config.get<string>("TRANSLATION_PROVIDER", "mock"))) as TranslationProvider;
    const cacheKey = this.translationCacheKey(provider, trimmed, from, to);
    const cached = this.getCachedTranslation(cacheKey);
    if (cached !== undefined) return cached;

    const inFlight = this.inFlightTranslations.get(cacheKey);
    if (inFlight) return inFlight;

    const request = this.translateWithProvider(provider, text, from, to)
      .then((translated) => { if (translated) this.setCachedTranslation(cacheKey, translated); return translated; })
      .finally(() => {
        this.inFlightTranslations.delete(cacheKey);
      });
    this.inFlightTranslations.set(cacheKey, request);
    return request;
  }

  private async translateWithProvider(provider: TranslationProvider, text: string, from: TranslationSourceLanguage, to: TranslationLanguage) {
    if (provider === "mock") return this.mockTranslate(text, to);
    if (!(await this.consumeTranslationQuota())) return "";
    if (provider === "aliyun_qwen") return this.translateWithAliyunQwen(text, to);
    if (provider === "baidu_cloud") return this.translateWithBaiduCloud(text, from, to);
    return this.translateWithBaidu(text, from, to);
  }

  private translationCacheKey(provider: TranslationProvider, text: string, from: TranslationSourceLanguage, to: TranslationLanguage) {
    const hash = createHash("sha256").update(text).digest("hex");
    return `${provider}:${from}:${to}:${hash}`;
  }

  private getCachedTranslation(key: string) {
    const cached = this.translationCache.get(key);
    if (!cached) return undefined;
    if (Date.now() >= cached.expiresAt) {
      this.translationCache.delete(key);
      return undefined;
    }
    cached.lastUsedAt = Date.now();
    return cached.value;
  }

  private setCachedTranslation(key: string, value: string) {
    const ttlMs = Math.max(this.config.get<number>("TRANSLATION_CACHE_TTL_SECONDS", 86400), 60) * 1000;
    this.translationCache.set(key, { value, expiresAt: Date.now() + ttlMs, lastUsedAt: Date.now() });
    this.trimTranslationCache();
  }

  private trimTranslationCache() {
    const maxEntries = Math.max(this.config.get<number>("TRANSLATION_CACHE_MAX_ENTRIES", 500), 50);
    if (this.translationCache.size <= maxEntries) return;
    const removable: Array<[string, CachedTranslation]> = Array.from(this.translationCache.entries()).sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
    for (const [key] of removable.slice(0, this.translationCache.size - maxEntries)) this.translationCache.delete(key);
  }

  private async consumeTranslationQuota() {
    const maxPerMinute = Math.max(await this.runtimeConfig.getNumber("TRANSLATION_MAX_REQUESTS_PER_MINUTE", this.config.get<number>("TRANSLATION_MAX_REQUESTS_PER_MINUTE", 120)), 1);
    const now = Date.now();
    if (now - this.translationWindowStartedAt >= 60_000) {
      this.translationWindowStartedAt = now;
      this.translationWindowCount = 0;
    }
    this.translationWindowCount += 1;
    if (this.translationWindowCount <= maxPerMinute) return true;
    this.logger.warn(`Translation request skipped by rate limit: ${this.translationWindowCount}/${maxPerMinute} in current minute.`);
    return false;
  }

  private mockTranslate(text: string, to: TranslationLanguage) {
    return to === "en" ? `EN draft: ${text}` : `Translation draft (${to}): ${text}`;
  }

  private async translateWithBaidu(text: string, from: TranslationSourceLanguage, to: TranslationLanguage) {
    const appId = (await this.runtimeConfig.get("BAIDU_TRANSLATE_APP_ID", this.config.get<string>("BAIDU_TRANSLATE_APP_ID", ""))).trim();
    const secret = (await this.runtimeConfig.get("BAIDU_TRANSLATE_SECRET", this.config.get<string>("BAIDU_TRANSLATE_SECRET", ""))).trim();
    if (!appId || !secret) {
      this.logger.warn("Baidu translation is selected but credentials are not configured.");
      return "";
    }

    const salt = randomUUID();
    const sign = createHash("md5").update(`${appId}${text}${salt}${secret}`).digest("hex");
    const body = new URLSearchParams({
      q: text,
      from: baiduLanguageCodes[from],
      to: baiduLanguageCodes[to],
      appid: appId,
      salt,
      sign
    });

    try {
      const response = await fetch("https://fanyi-api.baidu.com/api/trans/vip/translate", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      const data = (await response.json().catch(() => ({}))) as BaiduTranslateResponse;
      if (!response.ok || data.error_code) {
        this.logger.warn(`Baidu translation failed: ${data.error_code ?? response.status} ${data.error_msg ?? response.statusText}`);
        return "";
      }
      return data.trans_result?.map((item) => item.dst).join("\n") ?? "";
    } catch (error) {
      this.logger.warn("Baidu translation request failed", error instanceof Error ? error.stack : String(error));
      return "";
    }
  }

  private async translateWithBaiduCloud(text: string, from: TranslationSourceLanguage, to: TranslationLanguage) {
    const apiKey = (await this.runtimeConfig.get("BAIDU_TRANSLATE_API_KEY", this.config.get<string>("BAIDU_TRANSLATE_API_KEY", ""))).trim();
    const secretKey = (await this.runtimeConfig.get("BAIDU_TRANSLATE_SECRET_KEY", this.config.get<string>("BAIDU_TRANSLATE_SECRET_KEY", ""))).trim();
    if (!apiKey || !secretKey) {
      this.logger.warn("Baidu Cloud translation is selected but API Key or Secret Key is not configured.");
      return "";
    }

    try {
      const accessToken = await this.getBaiduCloudAccessToken(apiKey, secretKey);
      if (!accessToken) return "";

      const url = new URL("https://aip.baidubce.com/rpc/2.0/mt/texttrans/v1");
      url.searchParams.set("access_token", accessToken);
      const response = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: baiduLanguageCodes[from],
          to: baiduLanguageCodes[to],
          q: text
        })
      });
      const data = (await response.json().catch(() => ({}))) as BaiduCloudTranslateResponse;
      if (!response.ok || data.error_code) {
        this.logger.warn(`Baidu Cloud translation failed: ${data.error_code ?? response.status} ${data.error_msg ?? response.statusText}`);
        return "";
      }
      return this.extractBaiduCloudTranslation(data);
    } catch (error) {
      this.logger.warn("Baidu Cloud translation request failed", error instanceof Error ? error.stack : String(error));
      return "";
    }
  }


  private async translateWithAliyunQwen(text: string, to: TranslationLanguage) {
    const apiKey = (await this.runtimeConfig.get("ALIYUN_DASHSCOPE_API_KEY", this.config.get<string>("ALIYUN_DASHSCOPE_API_KEY", ""))).trim();
    if (!apiKey) {
      this.logger.warn("Aliyun Qwen translation is selected but DashScope API Key is not configured.");
      return "";
    }
    const baseUrl = this.normalizeBaseUrl(await this.runtimeConfig.get("ALIYUN_DASHSCOPE_BASE_URL", this.config.get<string>("ALIYUN_DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")));
    const model = (await this.runtimeConfig.get("ALIYUN_TRANSLATE_MODEL", this.config.get<string>("ALIYUN_TRANSLATE_MODEL", "qwen3.7-plus"))).trim() || "qwen3.7-plus";
    const target = TRANSLATION_LANGUAGE_OPTIONS.find((item) => item.code === to);
    const targetName = target ? `${target.label} (${target.nativeLabel})` : to;

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: `Translate the user's text into ${targetName}. Preserve punctuation and line breaks. Return only the translated text. If the text is already in ${targetName}, return it unchanged.` },
            { role: "user", content: text.trim() }
          ]
        })
      });
      const responseText = await response.text().catch(() => "");
      const data = this.parseJsonResponse(responseText) as ChatCompletionResponse;
      if (!response.ok) {
        this.logger.warn(`Aliyun Qwen translation failed: ${response.status} ${data.error?.message ?? data.message ?? response.statusText}`);
        return "";
      }
      const translated = this.extractChatText(data);
      if (!translated) this.logger.warn("Aliyun Qwen translation returned empty text.");
      return translated;
    } catch (error) {
      this.logger.warn("Aliyun Qwen translation request failed", error instanceof Error ? error.stack : String(error));
      return "";
    }
  }
  private async getBaiduCloudAccessToken(apiKey: string, secretKey: string) {
    const now = Date.now();
    if (this.baiduCloudAccessToken && now < this.baiduCloudAccessTokenExpiresAt) {
      return this.baiduCloudAccessToken;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: apiKey,
      client_secret: secretKey
    });
    const response = await fetch("https://aip.baidubce.com/oauth/2.0/token", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = (await response.json().catch(() => ({}))) as BaiduCloudTokenResponse;
    if (!response.ok || !data.access_token) {
      this.logger.warn(`Baidu Cloud token request failed: ${data.error ?? response.status} ${data.error_description ?? response.statusText}`);
      return "";
    }

    this.baiduCloudAccessToken = data.access_token;
    this.baiduCloudAccessTokenExpiresAt = now + Math.max((data.expires_in ?? 3600) - 60, 60) * 1000;
    return this.baiduCloudAccessToken;
  }

  private extractBaiduCloudTranslation(data: BaiduCloudTranslateResponse) {
    const list = data.result?.trans_result ?? data.trans_result;
    if (list?.length) {
      return list.map((item) => item.dst).filter(Boolean).join("\n");
    }
    return data.result?.translated_text ?? data.translated_text ?? data.result?.dst ?? data.dst ?? "";
  }

  private extractChatText(data: ChatCompletionResponse) {
    return (data.choices?.[0]?.message?.content ?? data.output?.text ?? data.text ?? "").trim();
  }

  private parseJsonResponse(text: string) {
    if (!text) return {};
    try { return JSON.parse(text) as unknown; } catch { return { message: text }; }
  }

  private normalizeBaseUrl(value: string) {
    return (value || "https://dashscope.aliyuncs.com/compatible-mode/v1").trim().replace(/\/+$/, "");
  }
}




