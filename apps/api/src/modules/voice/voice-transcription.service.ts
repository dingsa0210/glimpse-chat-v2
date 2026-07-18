import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { TRANSLATION_LANGUAGE_OPTIONS, type TranslationLanguage } from "@glimpse/shared";
import { SystemConfigService } from "../system-config/system-config.service";
import { OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WebSocket } from "ws";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output?: { text?: string };
  text?: string;
  error?: { message?: string };
  message?: string;
};

type TtsVoiceOption = { value: string; label: string; description?: string };
type SynthesizedSpeech = { buffer: Buffer; mimeType: string; voiceType: string; cacheStatus?: "HIT" | "MISS" };
type CachedTtsMetadata = { createdAt: number; mimeType: string; voiceType: string };

const DEFAULT_DOUBAO_TTS_VOICES: TtsVoiceOption[] = [
  { value: "zh_female_xiaohe_uranus_bigtts", label: "小何 2.0 - 女声" },
  { value: "zh_female_vv_uranus_bigtts", label: "Vivi 2.0 - 女声" }
];

const DEFAULT_ALIYUN_TTS_VOICES: TtsVoiceOption[] = [
  { value: "Tina", label: "Tina · 多语种女声", description: "自然清晰，支持中文、英文和印地语。" },
  { value: "Cindy", label: "Cindy · 亲和女声", description: "亲和明亮，支持中文、英文和印地语。" },
  { value: "Liora Mira", label: "Liora Mira · 温柔女声", description: "温柔舒缓，支持中文、英文和印地语。" },
  { value: "Sunnybobi", label: "Sunnybobi · 活力女声", description: "轻快有活力，支持中文、英文和印地语。" },
  { value: "Raymond", label: "Raymond · 稳重男声", description: "稳重自然，支持中文、英文和印地语。" },
  { value: "Ethan", label: "Ethan · 清晰男声", description: "清晰平和，支持中文、英文和印地语。" },
  { value: "Theo Calm", label: "Theo Calm · 沉静男声", description: "沉静舒缓，支持中文、英文和印地语。" },
  { value: "Serena", label: "Serena · 自然女声", description: "自然流畅，支持中文、英文和印地语。" }
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
export class VoiceTranscriptionService implements OnModuleDestroy {
  private readonly logger = new Logger(VoiceTranscriptionService.name);
  private readonly ttsCacheDir: string;
  private readonly ttsCacheTtlMs: number;
  private readonly ttsCacheCleanupTimer: NodeJS.Timeout;
  private readonly pendingTts = new Map<string, Promise<SynthesizedSpeech>>();

  constructor(private readonly runtimeConfig: SystemConfigService, config: ConfigService) {
    const cwd = process.cwd();
    const repoRoot = cwd.endsWith(join("apps", "api")) ? resolve(cwd, "..", "..") : cwd;
    this.ttsCacheDir = resolve(config.get<string>("TTS_CACHE_DIR", join(repoRoot, "99_输出结果", "glimpse-tts-cache")));
    const configuredTtlSeconds = Number(config.get<string | number>("TTS_CACHE_TTL_SECONDS", 86_400));
    this.ttsCacheTtlMs = Math.max(Number.isFinite(configuredTtlSeconds) ? configuredTtlSeconds : 86_400, 60) * 1000;
    mkdirSync(this.ttsCacheDir, { recursive: true });
    void this.cleanupExpiredTtsCache();
    this.ttsCacheCleanupTimer = setInterval(() => void this.cleanupExpiredTtsCache(), 60 * 60 * 1000);
    this.ttsCacheCleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.ttsCacheCleanupTimer);
  }

  async checkTtsProviderHealth(provider: "browser" | "doubao" | "aliyun_bailian") {
    if (provider === "browser") return { elapsedMs: 0, detail: "Browser capability is checked by the administrator page.", clientCheckRequired: true };
    const startedAt = Date.now();
    const result = provider === "aliyun_bailian"
      ? await this.synthesizeAliyunBailianSpeech({ text: "नमस्ते।", language: "hi" })
      : await this.synthesizeDoubaoSpeech({ text: "健康检查。", language: "zh" });
    const audioSize = result.buffer.length;
    if (!audioSize) throw new BadRequestException(`${provider} TTS returned empty audio.`);
    return { elapsedMs: Date.now() - startedAt, detail: `Received ${audioSize} bytes of audio.` };
  }

  async checkTranscriptionProviderHealth() {
    const provider = (await this.runtimeConfig.get("VOICE_TRANSCRIBE_PROVIDER", "doubao")).trim().toLowerCase() || "doubao";
    if (provider === "doubao") {
      const apiKey = (await this.runtimeConfig.get("DOUBAO_ASR_API_KEY", "")).trim() || (await this.runtimeConfig.get("DOUBAO_API_KEY", "")).trim();
      const model = (await this.runtimeConfig.get("DOUBAO_ASR_MODEL", "volc.seedasr.auc")).trim();
      const submitUrl = (await this.runtimeConfig.get("DOUBAO_ASR_BASE_URL", "")).trim();
      const queryUrl = (await this.runtimeConfig.get("DOUBAO_ASR_QUERY_URL", "")).trim();
      if (!apiKey) throw new BadRequestException("Doubao ASR API Key is not configured.");
      if (!model || !submitUrl || !queryUrl) throw new BadRequestException("Doubao ASR model or endpoint is not configured.");
      new URL(submitUrl);
      new URL(queryUrl);
      return { provider, elapsedMs: 0, detail: "Credentials, model, submit URL and query URL are configured; an audio sample is required for a real recognition call." };
    }
    if (provider === "aliyun") {
      const apiKey = (await this.runtimeConfig.get("ALIYUN_ASR_API_KEY", "")).trim() || (await this.runtimeConfig.get("ALIYUN_DASHSCOPE_API_KEY", "")).trim();
      const baseUrl = (await this.runtimeConfig.get("ALIYUN_ASR_BASE_URL", "")).trim() || (await this.runtimeConfig.get("ALIYUN_DASHSCOPE_BASE_URL", "")).trim();
      const model = (await this.runtimeConfig.get("ALIYUN_ASR_MODEL", "qwen3-asr-flash")).trim();
      if (!apiKey) throw new BadRequestException("Aliyun ASR API Key is not configured.");
      if (!baseUrl || !model) throw new BadRequestException("Aliyun ASR model or endpoint is not configured.");
      new URL(baseUrl);
      return { provider, elapsedMs: 0, detail: "Credentials, model and endpoint are configured; an audio sample is required for a real recognition call." };
    }
    throw new BadRequestException(`Configured transcription provider is not supported: ${provider}.`);
  }

  async getTtsRuntimeConfig() {
    const provider = (await this.runtimeConfig.get("TTS_PROVIDER", "browser")).trim().toLowerCase() || "browser";
    if (!["browser", "doubao", "aliyun_bailian"].includes(provider)) throw new BadRequestException(`Configured TTS provider is not supported: ${provider}.`);
    const voices = await this.getDoubaoTtsVoices();
    const configuredVoice = (await this.runtimeConfig.get("DOUBAO_TTS_VOICE", "")).trim();
    const voiceType = configuredVoice || voices[0]?.value || "zh_female_xiaohe_uranus_bigtts";
    const aliyunVoice = (await this.runtimeConfig.get("ALIYUN_TTS_VOICE", "Tina")).trim() || "Tina";
    const aliyunModel = (await this.runtimeConfig.get("ALIYUN_TTS_MODEL", "qwen3.5-omni-plus")).trim() || "qwen3.5-omni-plus";
    const aliyunVoices = DEFAULT_ALIYUN_TTS_VOICES.some((item) => item.value === aliyunVoice)
      ? DEFAULT_ALIYUN_TTS_VOICES
      : [{ value: aliyunVoice, label: aliyunVoice }, ...DEFAULT_ALIYUN_TTS_VOICES];
    return { provider, doubao: { voiceType, voices }, aliyun: { voiceType: aliyunVoice, model: aliyunModel, voices: aliyunVoices } };
  }

  async synthesizeSpeech(input: { text: string; language?: string; voiceType?: string }) {
    const provider = (await this.runtimeConfig.get("TTS_PROVIDER", "browser")).trim().toLowerCase() || "browser";
    if (!input.text.trim()) throw new BadRequestException("Text is required for TTS.");
    if (!["doubao", "aliyun_bailian"].includes(provider)) throw new BadRequestException(`Cloud TTS is not enabled for the selected provider: ${provider}.`);
    const cacheKey = await this.ttsCacheKey(provider, input);
    const cached = await this.readTtsCache(cacheKey);
    if (cached) return { ...cached, cacheStatus: "HIT" as const };
    const pending = this.pendingTts.get(cacheKey);
    if (pending) return { ...await pending, cacheStatus: "HIT" as const };
    const generation = (provider === "doubao" ? this.synthesizeDoubaoSpeech(input) : this.synthesizeAliyunBailianSpeech(input))
      .then(async (audio) => {
        await this.writeTtsCache(cacheKey, audio);
        return audio;
      })
      .finally(() => this.pendingTts.delete(cacheKey));
    this.pendingTts.set(cacheKey, generation);
    return { ...await generation, cacheStatus: "MISS" as const };
  }

  private async ttsCacheKey(provider: string, input: { text: string; language?: string; voiceType?: string }) {
    const configuredVoice = provider === "aliyun_bailian"
      ? await this.runtimeConfig.get("ALIYUN_TTS_VOICE", "Tina")
      : await this.runtimeConfig.get("DOUBAO_TTS_VOICE", "");
    const model = provider === "aliyun_bailian"
      ? await this.runtimeConfig.get("ALIYUN_TTS_MODEL", "qwen3.5-omni-plus")
      : await this.runtimeConfig.get("DOUBAO_TTS_MODEL", "seed-tts-2.0");
    const endpoint = provider === "aliyun_bailian"
      ? await this.runtimeConfig.get("ALIYUN_TTS_BASE_URL", "")
      : await this.runtimeConfig.get("DOUBAO_TTS_BASE_URL", "");
    return createHash("sha256").update(JSON.stringify({
      provider,
      model: model.trim(),
      endpoint: endpoint.trim(),
      voiceType: input.voiceType?.trim() || configuredVoice.trim(),
      language: input.language?.trim() || "",
      text: input.text.trim()
    })).digest("hex");
  }

  private ttsCachePaths(cacheKey: string) {
    return {
      audio: resolve(this.ttsCacheDir, `${cacheKey}.audio`),
      metadata: resolve(this.ttsCacheDir, `${cacheKey}.json`)
    };
  }

  private async readTtsCache(cacheKey: string): Promise<SynthesizedSpeech | null> {
    const paths = this.ttsCachePaths(cacheKey);
    try {
      const metadata = JSON.parse(await readFile(paths.metadata, "utf8")) as CachedTtsMetadata;
      if (!metadata.createdAt || Date.now() - metadata.createdAt >= this.ttsCacheTtlMs) {
        await Promise.allSettled([rm(paths.audio, { force: true }), rm(paths.metadata, { force: true })]);
        return null;
      }
      const buffer = await readFile(paths.audio);
      if (!buffer.length || !metadata.mimeType || !metadata.voiceType) throw new Error("Invalid cached TTS entry.");
      return { buffer, mimeType: metadata.mimeType, voiceType: metadata.voiceType };
    } catch {
      await Promise.allSettled([rm(paths.audio, { force: true }), rm(paths.metadata, { force: true })]);
      return null;
    }
  }

  private async writeTtsCache(cacheKey: string, audio: SynthesizedSpeech) {
    const paths = this.ttsCachePaths(cacheKey);
    const nonce = randomUUID();
    const temporaryAudio = `${paths.audio}.${nonce}.tmp`;
    const temporaryMetadata = `${paths.metadata}.${nonce}.tmp`;
    const metadata: CachedTtsMetadata = { createdAt: Date.now(), mimeType: audio.mimeType, voiceType: audio.voiceType };
    try {
      await writeFile(temporaryAudio, audio.buffer);
      await writeFile(temporaryMetadata, JSON.stringify(metadata), "utf8");
      await rename(temporaryAudio, paths.audio);
      await rename(temporaryMetadata, paths.metadata);
    } finally {
      await Promise.allSettled([rm(temporaryAudio, { force: true }), rm(temporaryMetadata, { force: true })]);
    }
  }

  private async cleanupExpiredTtsCache() {
    try {
      const files = await readdir(this.ttsCacheDir);
      const now = Date.now();
      await Promise.all(files.map(async (fileName) => {
        const target = resolve(this.ttsCacheDir, fileName);
        if (!target.startsWith(this.ttsCacheDir)) return;
        const fileStat = await stat(target).catch(() => null);
        if (fileStat && now - fileStat.mtimeMs >= this.ttsCacheTtlMs) await rm(target, { force: true });
      }));
    } catch (error) {
      this.logger.warn("TTS cache cleanup failed", error instanceof Error ? error.message : String(error));
    }
  }

  private async synthesizeAliyunBailianSpeech(input: { text: string; language?: string; voiceType?: string }) {
    const text = input.text.trim();
    if (!text) throw new BadRequestException("Text is required for TTS.");
    if (text.length > 800) throw new BadRequestException("Text is too long for one read-aloud request.");
    const apiKey = (await this.runtimeConfig.get("ALIYUN_TTS_API_KEY", "")).trim()
      || (await this.runtimeConfig.get("ALIYUN_DASHSCOPE_API_KEY", "")).trim();
    if (!apiKey) throw new BadRequestException("Aliyun Bailian TTS API Key is not configured.");
    const dedicatedBaseUrl = (await this.runtimeConfig.get("ALIYUN_TTS_BASE_URL", "")).trim();
    const baseUrl = this.normalizeBaseUrl(dedicatedBaseUrl || await this.runtimeConfig.get("ALIYUN_DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"));
    const model = (await this.runtimeConfig.get("ALIYUN_TTS_MODEL", "qwen3.5-omni-plus")).trim() || "qwen3.5-omni-plus";
    const configuredVoice = (await this.runtimeConfig.get("ALIYUN_TTS_VOICE", "Tina")).trim() || "Tina";
    const voiceType = input.voiceType?.trim() || configuredVoice;
    if (/-realtime(?:-|$)/i.test(model)) {
      return this.synthesizeAliyunBailianRealtimeSpeech({ text, apiKey, baseUrl, model, voiceType });
    }
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a deterministic text-to-speech reader. Repeat the user's message verbatim in the same language. Do not translate, explain, add, remove, or paraphrase anything. Output only the exact message." },
          { role: "user", content: text }
        ],
        modalities: ["text", "audio"],
        audio: { voice: voiceType, format: "wav" },
        stream: true,
        stream_options: { include_usage: true }
      })
    }).catch((error) => {
      this.logger.warn("Aliyun Bailian TTS request failed", error instanceof Error ? error.stack : String(error));
      throw new BadRequestException("Aliyun Bailian TTS request failed.");
    });
    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      const data = this.parseJsonResponse(responseText) as { error?: { message?: string }; message?: string };
      const reason = data.error?.message || data.message || responseText || response.statusText;
      this.logger.warn(`Aliyun Bailian TTS failed: ${response.status} ${reason}`);
      if (/model\s*not\s*exist|model_not_found/i.test(String(reason))) {
        throw new BadRequestException(`Aliyun Bailian TTS model ${model} is not available for the current API key/workspace. Enable Qwen3.5-Omni in Model Studio or configure its workspace-specific Base URL and API Key.`);
      }
      throw new BadRequestException(`Aliyun Bailian TTS failed: ${String(reason).slice(0, 500)}`);
    }
    let audioBase64 = "";
    let generatedText = "";
    let providerError = "";
    for (const line of responseText.split(/\r?\n/)) {
      const payload = line.trim();
      if (!payload.startsWith("data:")) continue;
      const jsonText = payload.slice(5).trim();
      if (!jsonText || jsonText === "[DONE]") continue;
      const event = this.parseJsonResponse(jsonText) as {
        choices?: Array<{ delta?: { content?: string; audio?: { data?: string } } }>;
        error?: { message?: string };
        message?: string;
      };
      audioBase64 += event.choices?.[0]?.delta?.audio?.data ?? "";
      generatedText += event.choices?.[0]?.delta?.content ?? "";
      providerError ||= event.error?.message || event.message || "";
    }
    if (!audioBase64) throw new BadRequestException(`Aliyun Bailian TTS returned no audio${providerError ? `: ${providerError}` : "."}`);
    this.warnOnTtsTranscriptMismatch("streaming", generatedText, text);
    const rawAudio = Buffer.from(audioBase64, "base64");
    if (!rawAudio.length) throw new BadRequestException("Aliyun Bailian TTS returned empty audio.");
    const buffer = rawAudio.subarray(0, 4).toString("ascii") === "RIFF" ? rawAudio : this.wrapPcmAsWav(rawAudio, 24000, 1, 16);
    return { buffer, mimeType: "audio/wav", voiceType };
  }

  private async synthesizeAliyunBailianRealtimeSpeech(input: { text: string; apiKey: string; baseUrl: string; model: string; voiceType: string }) {
    const endpoint = new URL(input.baseUrl);
    endpoint.protocol = endpoint.protocol === "http:" ? "ws:" : "wss:";
    endpoint.pathname = "/api-ws/v1/realtime";
    endpoint.search = "";
    endpoint.searchParams.set("model", input.model);

    const pcm = await new Promise<Buffer>((resolve, reject) => {
      const socket = new WebSocket(endpoint, { headers: { Authorization: `Bearer ${input.apiKey}` } });
      const chunks: Buffer[] = [];
      let transcript = "";
      let settled = false;
      let responseRequested = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
        if (error) reject(error);
        else resolve(Buffer.concat(chunks));
      };
      const timeout = setTimeout(() => finish(new Error("Aliyun Bailian Realtime TTS timed out.")), 90_000);
      const send = (payload: object) => socket.send(JSON.stringify(payload));

      socket.on("message", (raw) => {
        let event: { type?: string; delta?: string; transcript?: string; error?: { message?: string }; message?: string; response?: { status?: string; status_details?: { error?: { message?: string } } } };
        try {
          event = JSON.parse(raw.toString()) as typeof event;
        } catch {
          return;
        }
        if (event.type === "session.created") {
          send({
            type: "session.update",
            event_id: `event_${randomUUID()}`,
            session: {
              modalities: ["text", "audio"],
              voice: input.voiceType,
              output_audio_format: "pcm",
              turn_detection: null,
              temperature: 0,
              instructions: "You are a deterministic text-to-speech reader. Speak the user's latest message verbatim in its original language. Never answer it. Never add a greeting, offer to help, explanation, translation, prefix, or suffix."
            }
          });
          return;
        }
        if (event.type === "session.updated" && !responseRequested) {
          responseRequested = true;
          send({
            type: "conversation.item.create",
            event_id: `event_${randomUUID()}`,
            item: { type: "message", role: "user", content: [{ type: "input_text", text: input.text }] }
          });
          send({
            type: "response.create",
            event_id: `event_${randomUUID()}`,
            response: {
              modalities: ["text", "audio"],
              instructions: "Read the user's latest message exactly as written. Output no other words before or after it."
            }
          });
          return;
        }
        if (event.type === "response.audio.delta" && event.delta) chunks.push(Buffer.from(event.delta, "base64"));
        if (event.type === "response.audio_transcript.delta") transcript += event.delta ?? "";
        if (event.type === "response.audio_transcript.done" && event.transcript) transcript = event.transcript;
        if (event.type === "error") finish(new Error(event.error?.message || event.message || "Aliyun Bailian Realtime TTS failed."));
        if (event.type === "response.done") {
          const providerError = event.response?.status_details?.error?.message;
          if (event.response?.status === "failed" || providerError) finish(new Error(providerError || "Aliyun Bailian Realtime TTS response failed."));
          else if (!chunks.length) finish(new Error("Aliyun Bailian Realtime TTS returned no audio."));
          else {
            this.warnOnTtsTranscriptMismatch("realtime", transcript, input.text);
            finish();
          }
        }
      });
      socket.on("error", (error) => finish(error));
      socket.on("close", () => {
        if (!settled) finish(new Error("Aliyun Bailian Realtime TTS connection closed before audio completed."));
      });
    }).catch((error) => {
      this.logger.warn("Aliyun Bailian Realtime TTS request failed", error instanceof Error ? error.stack : String(error));
      throw new BadRequestException(error instanceof Error ? error.message : "Aliyun Bailian Realtime TTS request failed.");
    });

    if (!pcm.length) throw new BadRequestException("Aliyun Bailian Realtime TTS returned empty audio.");
    return { buffer: this.wrapPcmAsWav(pcm, 24000, 1, 16), mimeType: "audio/wav", voiceType: input.voiceType };
  }

  private isVerbatimTranscript(transcript: string, source: string) {
    const normalize = (value: string) => value
      .normalize("NFKC")
      .toLocaleLowerCase("und")
      .replace(/[\p{White_Space}\p{Cf}\p{P}]+/gu, "");
    return normalize(transcript) === normalize(source);
  }

  private warnOnTtsTranscriptMismatch(mode: "streaming" | "realtime", transcript: string, source: string) {
    const generated = transcript.trim();
    if (!generated || this.isVerbatimTranscript(generated, source)) return;
    // The provider transcript is an auxiliary ASR-style rendering of the
    // generated audio. Chinese digits, simplified/traditional characters and
    // punctuation can differ even when the spoken content is correct. Keep
    // the strict read-verbatim model instructions, but do not discard valid
    // audio solely because this advisory transcript differs.
    this.logger.warn(`Aliyun Bailian ${mode} TTS transcript differed from the source; audio retained (sourceLength=${source.length}, transcriptLength=${generated.length}).`);
  }

  private wrapPcmAsWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number) {
    const header = Buffer.alloc(44);
    const blockAlign = channels * bitsPerSample / 8;
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVEfmt ", 8, "ascii");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * blockAlign, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36, "ascii");
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
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
    const voiceType = input.voiceType?.trim() || configuredVoice || voices[0]?.value || "zh_female_xiaohe_uranus_bigtts";
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
        req_params: {
          text,
          speaker: voiceType,
          audio_params: { format: "mp3", sample_rate: 24000 }
        }
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
    const streamedAudio = this.parseDoubaoTtsEvents(responseText);
    if (streamedAudio.error) {
      this.logger.warn(`Doubao TTS failed: ${response.status} ${streamedAudio.error}`);
      throw new BadRequestException(`Doubao TTS failed: ${streamedAudio.error}`);
    }
    if (streamedAudio.buffer.length) return { buffer: streamedAudio.buffer, mimeType: "audio/mpeg", voiceType };
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

  private parseDoubaoTtsEvents(responseText: string) {
    const chunks: Buffer[] = [];
    let error = "";
    for (const line of responseText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      const event = this.parseJsonResponse(line) as { code?: number; message?: string; data?: unknown };
      if (typeof event.data === "string" && event.data) {
        try { chunks.push(Buffer.from(event.data, "base64")); } catch { error = "Doubao TTS returned invalid audio data."; }
      }
      if (typeof event.code === "number" && ![0, 20000000].includes(event.code)) {
        error = event.message || `Doubao TTS error ${event.code}`;
      }
    }
    return { buffer: Buffer.concat(chunks), error };
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

    if (requestMode === "chat_audio_url" || (requestMode === "auto" && publicMediaUrl && !this.isPrivateMediaUrl(publicMediaUrl))) {
      try {
        return await this.transcribeAudioUrl({ apiKey, baseUrl, model, audioUrl: publicMediaUrl });
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
  private async transcribeAudioUrl(input: { apiKey: string; baseUrl: string; model: string; audioUrl: string }) {
    if (!input.audioUrl) throw new BadRequestException("ASR audio URL mode requires a public media URL.");
    if (this.isPrivateMediaUrl(input.audioUrl)) throw new BadRequestException("ASR audio URL mode requires a public HTTPS media URL. Configure PUBLIC_MEDIA_BASE_URL or test after deploying media files to a public HTTPS domain.");
    const response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: "user", content: [{ type: "audio", audio: input.audioUrl }] }]
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












