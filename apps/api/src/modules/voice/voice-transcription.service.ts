import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { TRANSLATION_LANGUAGE_OPTIONS, type TranslationLanguage } from "@glimpse/shared";
import { SystemConfigService } from "../system-config/system-config.service";
import { randomUUID } from "node:crypto";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output?: { text?: string };
  text?: string;
  error?: { message?: string };
  message?: string;
};

type TtsVoiceOption = { value: string; label: string; description?: string };
type TtsResponseBody = {
  code?: number;
  message?: string;
  error?: { message?: string };
  data?: string | { audio?: string; binary_data_base64?: string };
  audio?: string;
  result?: { audio?: string };
};

const DEFAULT_DOUBAO_TTS_VOICES: TtsVoiceOption[] = [
  { value: "zh_female_wanwanxiaohe_moon_bigtts", label: "湾湾小何 - 女声" },
  { value: "zh_male_yangguangqingnian_moon_bigtts", label: "阳光青年 - 男声" },
  { value: "zh_female_tianmeixiaoyuan_moon_bigtts", label: "甜美小源 - 女声" },
  { value: "zh_male_guozhoudege_moon_bigtts", label: "国州的哥 - 男声" },
  { value: "zh_female_shuangkuaisisi_moon_bigtts", label: "爽快思思 - 女声" },
  { value: "zh_female_gaolengyujie_moon_bigtts", label: "高冷御姐 - 女声" },
  { value: "zh_male_jingqiangkanye_moon_bigtts", label: "京腔侃爷 - 男声" },
  { value: "zh_female_linjianvhai_moon_bigtts", label: "邻家女孩 - 女声" },
  { value: "en_male_adam_mars_bigtts", label: "Adam - English male" }
];

type TranscriptionResponse = {
  text?: string;
  output?: { text?: string; sentence?: { text?: string }; sentences?: Array<{ text?: string }> };
  results?: Array<{ text?: string }>;
  transcription?: string;
  error?: { message?: string };
  message?: string;
};

@Injectable()
export class VoiceTranscriptionService {
  private readonly logger = new Logger(VoiceTranscriptionService.name);

  constructor(private readonly runtimeConfig: SystemConfigService) {}


  async getTtsRuntimeConfig() {
    const provider = (await this.runtimeConfig.get("TTS_PROVIDER", "browser")).trim().toLowerCase() || "browser";
    const voices = await this.getDoubaoTtsVoices();
    const configuredVoice = (await this.runtimeConfig.get("DOUBAO_TTS_VOICE", "")).trim();
    const voiceType = configuredVoice || voices[0]?.value || "zh_female_wanwanxiaohe_moon_bigtts";
    return { provider, doubao: { voiceType, voices } };
  }

  async synthesizeSpeech(input: { text: string; language?: string; voiceType?: string }) {
    const provider = (await this.runtimeConfig.get("TTS_PROVIDER", "browser")).trim().toLowerCase() || "browser";
    if (provider !== "doubao") throw new BadRequestException("Cloud TTS is not enabled. Set TTS_PROVIDER to doubao.");
    return this.synthesizeDoubaoSpeech(input);
  }

  private async synthesizeDoubaoSpeech(input: { text: string; language?: string; voiceType?: string }) {
    const text = input.text.trim();
    if (!text) throw new BadRequestException("Text is required for TTS.");
    if (text.length > 800) throw new BadRequestException("Text is too long for one read-aloud request.");
    const apiKey = (await this.runtimeConfig.get("DOUBAO_TTS_API_KEY", "")).trim() || (await this.runtimeConfig.get("DOUBAO_API_KEY", "")).trim();
    if (!apiKey) throw new BadRequestException("Doubao TTS API Key is not configured.");
    const configuredEndpoint = (await this.runtimeConfig.get("DOUBAO_TTS_BASE_URL", "")).trim() || (await this.runtimeConfig.get("DOUBAO_BASE_URL", "https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional")).trim();
    const endpoint = this.normalizeDoubaoTtsEndpoint(configuredEndpoint);
    const resourceId = (await this.runtimeConfig.get("DOUBAO_TTS_MODEL", "seed-tts-2.0")).trim() || "seed-tts-2.0";
    const voices = await this.getDoubaoTtsVoices();
    const configuredVoice = (await this.runtimeConfig.get("DOUBAO_TTS_VOICE", "")).trim();
    const voiceType = input.voiceType?.trim() || configuredVoice || voices[0]?.value || "zh_female_wanwanxiaohe_moon_bigtts";
    if (!voices.some((voice) => voice.value === voiceType) && configuredVoice && voiceType !== configuredVoice) {
      throw new BadRequestException("Selected Doubao TTS voice is not allowed by the backend voice list.");
    }
    const requestId = randomUUID();
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Api-Resource-Id": resourceId,
        "X-Api-Request-Id": requestId,
        "X-Api-Sequence": "-1"
      },
      body: JSON.stringify({
        user: { uid: "glimpse-chat" },
        audio: { voice_type: voiceType, encoding: "mp3", speed_ratio: 1.0, volume_ratio: 1.0, pitch_ratio: 1.0 },
        request: { reqid: requestId, text, operation: "query" }
      })
    }).catch((error) => {
      this.logger.warn("Doubao TTS request failed", error instanceof Error ? error.stack : String(error));
      throw new BadRequestException("Doubao TTS request failed.");
    });
    const contentType = response.headers.get("content-type") ?? "";
    const statusCode = response.headers.get("x-api-status-code") ?? "";
    const statusMessage = response.headers.get("x-api-message") ?? "";
    if (contentType.includes("audio") || contentType.includes("octet-stream")) {
      if (!response.ok) throw new BadRequestException(statusMessage || "Doubao TTS failed.");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new BadRequestException("Doubao TTS returned empty audio.");
      return { buffer, mimeType: contentType.includes("audio") ? contentType : "audio/mpeg", voiceType };
    }
    const responseText = await response.text().catch(() => "");
    const data = this.parseJsonResponse(responseText) as { data?: string | { audio?: string; binary_data_base64?: string }; audio?: string; result?: { audio?: string }; error?: { message?: string }; message?: string };
    if (!response.ok || (statusCode && statusCode !== "20000000")) {
      const reason = statusMessage || data.error?.message || data.message || responseText || response.statusText;
      this.logger.warn(`Doubao TTS failed: ${response.status} ${statusCode} ${reason}`);
      throw new BadRequestException(`Doubao TTS failed: ${reason}`);
    }
    const audioBase64 = this.extractTtsAudioBase64(data);
    if (!audioBase64) throw new BadRequestException("Doubao TTS returned no audio.");
    return { buffer: Buffer.from(audioBase64, "base64"), mimeType: "audio/mpeg", voiceType };
  }

  private normalizeDoubaoTtsEndpoint(endpoint: string) {
    const fallback = "https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional";
    const value = endpoint.trim() || fallback;
    if (/^wss?:\/\//i.test(value)) {
      return value
        .replace(/^wss:\/\//i, "https://")
        .replace(/^ws:\/\//i, "http://")
        .replace(/\/bidirectional(?:\/stream)?\/?$/i, "/unidirectional")
        .replace(/\/unidirectional\/stream\/?$/i, "/unidirectional");
    }
    return value.replace(/\/unidirectional\/stream\/?$/i, "/unidirectional");
  }
  private async getDoubaoTtsVoices() {
    const raw = (await this.runtimeConfig.get("DOUBAO_TTS_VOICES_JSON", "")).trim();
    if (!raw) return DEFAULT_DOUBAO_TTS_VOICES;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return DEFAULT_DOUBAO_TTS_VOICES;
      const voices: TtsVoiceOption[] = parsed
        .map((item): TtsVoiceOption | null => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const value = String(record.value ?? record.voiceType ?? record.voice_type ?? "").trim();
          const label = String(record.label ?? record.name ?? value).trim();
          const description = record.description ? String(record.description) : undefined;
          return value ? { value, label: label || value, description } : null;
        })
        .filter((item): item is TtsVoiceOption => item !== null);
      return voices.length ? voices : DEFAULT_DOUBAO_TTS_VOICES;
    } catch {
      return DEFAULT_DOUBAO_TTS_VOICES;
    }
  }

  private extractTtsAudioBase64(data: { data?: string | { audio?: string; binary_data_base64?: string }; audio?: string; result?: { audio?: string } }) {
    if (typeof data.data === "string") return data.data;
    return data.audio ?? data.result?.audio ?? data.data?.audio ?? data.data?.binary_data_base64 ?? "";
  }
  async transcribeAudio(input: { buffer: Buffer; fileName: string; mimeType: string; mediaUrl?: string }) {
    const provider = (await this.runtimeConfig.get("VOICE_TRANSCRIBE_PROVIDER", "aliyun")).trim().toLowerCase();
    if (provider === "doubao") return this.transcribeDoubaoAudio(input);
    if (provider !== "aliyun") throw new BadRequestException("Voice transcription provider is not supported.");
    const apiKey = (await this.runtimeConfig.get("ALIYUN_ASR_API_KEY", "")).trim() || (await this.runtimeConfig.get("ALIYUN_DASHSCOPE_API_KEY", "")).trim();
    if (!apiKey) throw new BadRequestException("Aliyun ASR API Key is not configured.");
    const dedicatedBaseUrl = (await this.runtimeConfig.get("ALIYUN_ASR_BASE_URL", "")).trim();
    const baseUrl = this.normalizeBaseUrl(dedicatedBaseUrl || await this.runtimeConfig.get("ALIYUN_DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"));
    const model = (await this.runtimeConfig.get("ALIYUN_ASR_MODEL", "qwen3-asr-flash")).trim() || "qwen3-asr-flash";
    const requestMode = (await this.runtimeConfig.get("ALIYUN_ASR_REQUEST_MODE", "auto")).trim().toLowerCase();
    const publicMediaUrl = await this.buildPublicMediaUrl(input.mediaUrl);

    // Qwen3-ASR-Flash uses the chat completions input_audio format. It accepts
    // local audio as a data URL (up to 10 MB), so local development does not
    // need to expose uploaded recordings on a public HTTPS domain.
    if (requestMode === "auto" && /^qwen3-asr-flash(?:-|$)/i.test(model) && input.buffer.length <= 10 * 1024 * 1024) {
      const mimeType = input.mimeType || "audio/webm";
      const audioData = `data:${mimeType};base64,${input.buffer.toString("base64")}`;
      return this.transcribeAudioInput({ apiKey, baseUrl, model, audioData });
    }

    if (requestMode === "chat_audio_url" || (requestMode === "auto" && publicMediaUrl && !this.isPrivateMediaUrl(publicMediaUrl))) {
      try {
        return await this.transcribeAudioInput({ apiKey, baseUrl, model, audioData: publicMediaUrl });
      } catch (error) {
        if (requestMode === "chat_audio_url") throw error;
        this.logger.warn("ASR audio URL mode failed; falling back to file upload", error instanceof Error ? error.stack : String(error));
      }
    }

    if (requestMode === "chat_audio_url") throw new BadRequestException("ASR audio URL mode requires a public HTTPS media URL. Configure PUBLIC_MEDIA_BASE_URL or test after deploying media files to a public HTTPS domain.");
    return this.transcribeAudioFile({ apiKey, baseUrl, model, input });
  }


  private async transcribeDoubaoAudio(input: { buffer: Buffer; fileName: string; mimeType: string; mediaUrl?: string }) {
    const apiKey = (await this.runtimeConfig.get("DOUBAO_ASR_API_KEY", "")).trim() || (await this.runtimeConfig.get("DOUBAO_API_KEY", "")).trim();
    if (!apiKey) throw new BadRequestException("Doubao ASR API Key is not configured.");
    const submitUrl = (await this.runtimeConfig.get("DOUBAO_ASR_BASE_URL", "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit")).trim();
    const queryUrl = (await this.runtimeConfig.get("DOUBAO_ASR_QUERY_URL", "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query")).trim();
    const resourceId = (await this.runtimeConfig.get("DOUBAO_ASR_MODEL", "volc.seedasr.auc")).trim() || "volc.seedasr.auc";
    const audioUrl = await this.buildPublicMediaUrl(input.mediaUrl);
    if (!audioUrl || this.isPrivateMediaUrl(audioUrl)) throw new BadRequestException("Doubao ASR requires a public HTTPS media URL. Configure PUBLIC_MEDIA_BASE_URL or test after deploying media files to a public HTTPS domain.");
    const taskId = randomUUID();
    const headers = {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": resourceId,
      "X-Api-Request-Id": taskId
    };
    const submitResponse = await fetch(submitUrl, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { ...headers, "X-Api-Sequence": "-1" },
      body: JSON.stringify({
        user: { uid: "glimpse-chat" },
        audio: { format: this.audioFormatFor(input.fileName, input.mimeType), url: audioUrl },
        request: { model_name: "bigmodel", enable_itn: true }
      })
    }).catch((error) => {
      this.logger.warn("Doubao ASR submit request failed", error instanceof Error ? error.stack : String(error));
      throw new BadRequestException("Doubao voice transcription submit failed.");
    });
    const submitBody = await submitResponse.text().catch(() => "");
    const submitCode = submitResponse.headers.get("x-api-status-code") ?? "";
    const submitMessage = submitResponse.headers.get("x-api-message") ?? submitBody;
    if (!submitResponse.ok || (submitCode && submitCode !== "20000000")) {
      this.logger.warn(`Doubao ASR submit failed: ${submitResponse.status} ${submitCode} ${submitMessage}`);
      throw new BadRequestException(`Doubao voice transcription submit failed: ${submitMessage || submitCode || submitResponse.statusText}`);
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (attempt > 0) await this.delay(3000);
      const queryResponse = await fetch(queryUrl, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers,
        body: "{}"
      }).catch((error) => {
        this.logger.warn("Doubao ASR query request failed", error instanceof Error ? error.stack : String(error));
        throw new BadRequestException("Doubao voice transcription query failed.");
      });
      const queryText = await queryResponse.text().catch(() => "");
      const queryData = this.parseJsonResponse(queryText) as { result?: { text?: string } | Array<{ text?: string }>; error?: { message?: string }; message?: string };
      const queryCode = queryResponse.headers.get("x-api-status-code") ?? "";
      const queryMessage = queryResponse.headers.get("x-api-message") ?? queryData.error?.message ?? queryData.message ?? "";
      const transcript = this.extractDoubaoText(queryData).trim();
      if (queryResponse.ok && transcript) return transcript;
      if (queryCode && queryCode !== "20000000" && !/processing|running|pending|处理中|排队/i.test(queryMessage)) {
        this.logger.warn(`Doubao ASR query failed: ${queryResponse.status} ${queryCode} ${queryMessage || queryText}`);
        throw new BadRequestException(`Doubao voice transcription query failed: ${queryMessage || queryCode || queryResponse.statusText}`);
      }
    }
    throw new BadRequestException("Doubao voice transcription timed out. Please try again later.");
  }
  private async transcribeAudioInput(input: { apiKey: string; baseUrl: string; model: string; audioData: string }) {
    if (!input.audioData) throw new BadRequestException("ASR audio input is missing.");
    if (!input.audioData.startsWith("data:") && this.isPrivateMediaUrl(input.audioData)) throw new BadRequestException("ASR audio URL mode requires a public HTTPS media URL. Configure PUBLIC_MEDIA_BASE_URL or test after deploying media files to a public HTTPS domain.");
    const response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: input.audioData } }] }]
      })
    }).catch((error) => {
      this.logger.warn("Aliyun ASR audio URL request failed", error instanceof Error ? error.stack : String(error));
      throw new BadRequestException("Voice transcription request failed.");
    });
    const responseText = await response.text().catch(() => "");
    const data = this.parseJsonResponse(responseText) as ChatCompletionResponse;
    if (!response.ok) {
      const reason = data.error?.message ?? data.message ?? responseText ?? response.statusText;
      this.logger.warn(`Aliyun ASR audio URL failed: ${response.status} ${reason}`);
      if (/download multimodal file timed out|download.*timed out/i.test(reason)) throw new BadRequestException("ASR provider could not download the audio file. Use a public HTTPS media URL that is reachable from the provider.");
      if (/provided URL|valid URL|invalid url/i.test(reason)) throw new BadRequestException("ASR provider rejected the media URL. Configure PUBLIC_MEDIA_BASE_URL with a public HTTPS domain.");
      if (/not support this input/i.test(reason)) throw new BadRequestException("The configured ASR provider rejected the audio URL input format.");
      throw new BadRequestException("Voice transcription failed. Please try again.");
    }
    const text = this.extractChatText(data).trim();
    if (!text) throw new BadRequestException("Voice transcription returned no text.");
    return text;
  }

  private async transcribeAudioFile(input: { apiKey: string; baseUrl: string; model: string; input: { buffer: Buffer; fileName: string; mimeType: string } }) {
    const form = new FormData();
    form.append("model", input.model);
    form.append("file", new Blob([new Uint8Array(input.input.buffer)], { type: input.input.mimeType || "audio/webm" }), input.input.fileName || "voice.webm");

    const response = await fetch(`${input.baseUrl}/audio/transcriptions`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form
    }).catch((error) => {
      this.logger.warn("Aliyun ASR request failed", error instanceof Error ? error.stack : String(error));
      throw new BadRequestException("Voice transcription request failed.");
    });

    const responseText = await response.text().catch(() => "");
    const data = this.parseJsonResponse(responseText) as TranscriptionResponse;
    if (!response.ok) {
      this.logger.warn(`Aliyun ASR failed: ${response.status} ${data.error?.message ?? data.message ?? response.statusText}`);
      const reason = data.error?.message ?? data.message ?? responseText ?? response.statusText;
      if (response.status === 404) throw new BadRequestException("The configured ASR endpoint does not support /audio/transcriptions. Set ALIYUN_ASR_REQUEST_MODE to chat_audio_url and configure PUBLIC_MEDIA_BASE_URL to a public HTTPS media domain, or use an ASR endpoint that supports file transcription.");
      if (/model not exist/i.test(reason)) throw new BadRequestException(`ASR model is not available on the configured provider: ${input.model}. Please configure ALIYUN_ASR_BASE_URL / ALIYUN_ASR_API_KEY or choose a supported ASR model.`);
      if (/not support this input|invalid url|provided URL/i.test(reason)) throw new BadRequestException(`The configured ASR provider rejected the audio input format. Please use a provider-compatible ASR endpoint or add its dedicated request adapter for ${input.model}.`);
      throw new BadRequestException("Voice transcription failed. Please try again.");
    }
    const text = this.extractTranscriptionText(data).trim();
    if (!text) throw new BadRequestException("Voice transcription returned no text.");
    return text;
  }

  async translateTranscript(text: string, targetLanguage: TranslationLanguage) {
    const trimmed = text.trim();
    if (!trimmed) return "";
    const apiKey = (await this.runtimeConfig.get("ALIYUN_DASHSCOPE_API_KEY", "")).trim();
    if (!apiKey) throw new BadRequestException("Aliyun DashScope API Key is not configured.");
    const baseUrl = this.normalizeBaseUrl(await this.runtimeConfig.get("ALIYUN_DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"));
    const model = (await this.runtimeConfig.get("ALIYUN_TRANSLATE_MODEL", "qwen3.7-plus")).trim() || "qwen3.7-plus";
    const target = TRANSLATION_LANGUAGE_OPTIONS.find((item) => item.code === targetLanguage);
    const targetName = target ? `${target.label} (${target.nativeLabel})` : targetLanguage;

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
          { role: "user", content: trimmed }
        ]
      })
    }).catch((error) => {
      this.logger.warn("Aliyun transcript translation request failed", error instanceof Error ? error.stack : String(error));
      throw new BadRequestException("Transcript translation request failed.");
    });

    const responseText = await response.text().catch(() => "");
    const data = this.parseJsonResponse(responseText) as ChatCompletionResponse;
    if (!response.ok) {
      this.logger.warn(`Aliyun transcript translation failed: ${response.status} ${data.error?.message ?? data.message ?? response.statusText}`);
      throw new BadRequestException("Transcript translation failed. Please try again.");
    }
    return this.extractChatText(data);
  }


  private audioFormatFor(fileName: string, mimeType: string) {
    const lowerName = (fileName || "").toLowerCase();
    if (lowerName.endsWith(".mp3") || mimeType.includes("mpeg")) return "mp3";
    if (lowerName.endsWith(".wav") || mimeType.includes("wav")) return "wav";
    if (lowerName.endsWith(".m4a") || mimeType.includes("mp4")) return "m4a";
    if (lowerName.endsWith(".ogg") || mimeType.includes("ogg")) return "ogg";
    if (lowerName.endsWith(".webm") || mimeType.includes("webm")) return "webm";
    return lowerName.split(".").pop() || "mp3";
  }

  private extractDoubaoText(data: { result?: { text?: string } | Array<{ text?: string }> }) {
    if (Array.isArray(data.result)) return data.result.map((item) => item.text).filter(Boolean).join("\n");
    return data.result?.text ?? "";
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }


  private async buildPublicMediaUrl(mediaUrl?: string) {
    if (!mediaUrl) return "";
    const configuredBase = (await this.runtimeConfig.get("PUBLIC_MEDIA_BASE_URL", "")).trim() || (await this.runtimeConfig.get("PUBLIC_API_URL", "")).trim() || (await this.runtimeConfig.get("NEXT_PUBLIC_API_URL", "")).trim();
    let parsed: URL;
    try { parsed = new URL(mediaUrl, "http://local"); } catch { return ""; }
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;
    if (configuredBase) return `${configuredBase.replace(/\/+$/, "")}${pathAndQuery}`;
    if (/^https?:$/i.test(parsed.protocol) && parsed.hostname !== "local") return parsed.toString();
    return "";
  }

  private isPrivateMediaUrl(value: string) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== "https:") return true;
      if (["localhost", "127.0.0.1", "0.0.0.0", "local"].includes(host) || host.endsWith(".local")) return true;
      if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
      return false;
    } catch {
      return true;
    }
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

  private extractTranscriptionText(data: TranscriptionResponse) {
    return [
      data.text,
      data.transcription,
      data.output?.text,
      data.output?.sentence?.text,
      ...(data.output?.sentences?.map((item) => item.text) ?? []),
      ...(data.results?.map((item) => item.text) ?? [])
    ].filter(Boolean).join("\n");
  }
}












