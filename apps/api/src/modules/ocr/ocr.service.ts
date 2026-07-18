import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TranslationLanguage } from "@glimpse/shared";
import { SystemConfigService } from "../system-config/system-config.service";

type VisionContent = string | Array<{ type?: string; text?: string; [key: string]: unknown }>;
type VisionResponse = {
  choices?: Array<{ message?: { content?: VisionContent } }>;
  output?: { text?: string };
  text?: string;
  error?: { message?: string };
  message?: string;
};

type PositionedOcrBlock = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  translatedText?: string;
  fontColor?: string;
  backgroundColor?: string;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
};

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly runtimeConfig: SystemConfigService, private readonly config: ConfigService) {}

  async checkProviderHealth() {
    const apiKey = (await this.runtimeConfig.get("ALIYUN_DASHSCOPE_API_KEY", this.config.get<string>("ALIYUN_DASHSCOPE_API_KEY", ""))).trim();
    if (!apiKey) throw new BadRequestException("Image OCR is unavailable: DashScope API Key is not configured.");
    const baseUrl = this.normalizeBaseUrl(await this.runtimeConfig.get("ALIYUN_DASHSCOPE_BASE_URL", this.config.get<string>("ALIYUN_DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")));
    const model = (await this.runtimeConfig.get("ALIYUN_OCR_MODEL", this.config.get<string>("ALIYUN_OCR_MODEL", "qwen3.7-plus"))).trim() || "qwen3.7-plus";
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BadRequestException(`OCR provider check failed: HTTP ${response.status}${body ? ` ${body.slice(0, 180)}` : ""}`);
    }
    return { elapsedMs: Date.now() - startedAt, detail: `DashScope is reachable; configured OCR model: ${model}.` };
  }

  async recognizeImage(input: { dataBase64: string; mimeType: string; size: number; targetLanguage?: TranslationLanguage }) {
    const apiKey = (await this.runtimeConfig.get("ALIYUN_DASHSCOPE_API_KEY", this.config.get<string>("ALIYUN_DASHSCOPE_API_KEY", ""))).trim();
    if (!apiKey) throw new BadRequestException("Image OCR is unavailable: DashScope API Key is not configured.");
    const baseUrl = this.normalizeBaseUrl(await this.runtimeConfig.get("ALIYUN_DASHSCOPE_BASE_URL", this.config.get<string>("ALIYUN_DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")));
    const configuredModel = (await this.runtimeConfig.get("ALIYUN_OCR_MODEL", this.config.get<string>("ALIYUN_OCR_MODEL", "qwen3.7-plus"))).trim() || "qwen3.7-plus";
    const models = Array.from(new Set([configuredModel, "qwen3.7-plus", "qwen3.6-flash"]));
    const imageUrl = `data:${input.mimeType};base64,${input.dataBase64}`;
    const translationInstruction = input.targetLanguage
      ? `同时把每个文字块翻译为语言代码 ${input.targetLanguage}，把译文放入 translatedText；原文仍放在 text。`
      : "不需要翻译，不要输出 translatedText。";

    try {
      let lastUnavailableReason = "Configured OCR model is unavailable.";
      for (const model of models) {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          signal: AbortSignal.timeout(300_000),
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 6144,
            enable_thinking: false,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: "你是图片 OCR、版面定位和翻译工具。只返回严格 JSON，不要 Markdown、代码围栏或说明。返回格式为 {\"text\":\"按阅读顺序合并的全部原文\",\"blocks\":[{\"text\":\"原文块\",\"x\":0.1,\"y\":0.2,\"width\":0.3,\"height\":0.06,\"translatedText\":\"可选译文\",\"fontColor\":\"#111111\",\"backgroundColor\":\"#ffffff\",\"fontWeight\":\"normal或bold\",\"textAlign\":\"left、center或right\"}]}。x、y、width、height 必须是相对整张输入图片的 0 到 1 小数；每个 block 对应一行或一个自然短句，位置尽量贴合原图文字。fontColor、backgroundColor、fontWeight、textAlign 要根据原图对应文字区域估算，用于把译文按原有样式覆盖回图片。"
              },
              { role: "user", content: [
                { type: "image_url", image_url: { url: imageUrl } },
                { type: "text", text: `完整识别图片中的所有可读文字，保留阅读顺序并返回每个文字块的位置。${translationInstruction}` }
              ] }
            ]
          })
        });
        const responseText = await response.text().catch(() => "");
        const data = this.parseJsonResponse(responseText) as VisionResponse;
        if (!response.ok) {
          const reason = data.error?.message ?? data.message ?? response.statusText;
          const modelUnavailable = response.status === 404 && /model.*(?:not exist|not found|unavailable)/i.test(String(reason));
          if (modelUnavailable) {
            lastUnavailableReason = String(reason);
            this.logger.warn(`Image OCR model ${model} is unavailable; trying fallback.`);
            continue;
          }
          this.logger.warn(`Image OCR request failed: ${response.status} ${reason}`);
          throw new BadRequestException(`Image OCR failed: ${reason}`);
        }
        if (model !== configuredModel) this.logger.warn(`Image OCR used fallback model ${model} because ${configuredModel} is unavailable.`);
        const content = this.extractContent(data);
        const result = this.parseStructuredOcr(content);
        if (!result.text) throw new BadRequestException("Image OCR returned no readable text.");
        return { ...result, targetLanguage: input.targetLanguage ?? null, model };
      }
      throw new BadRequestException(`Image OCR failed: ${lastUnavailableReason}`);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn("Image OCR request failed", error instanceof Error ? error.stack : String(error));
      throw new BadRequestException("Image OCR request failed. Please check the OCR model and network configuration.");
    }
  }

  private extractContent(data: VisionResponse) {
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) return content.map((item) => typeof item?.text === "string" ? item.text : "").filter(Boolean).join("\n").trim();
    return (data.output?.text ?? data.text ?? "").trim();
  }

  private parseStructuredOcr(content: string) {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { text: cleaned, blocks: cleaned ? [{ text: cleaned, x: 0.03, y: 0.03, width: 0.94, height: 0.12 }] : [] };
    }
    const payload = Array.isArray(parsed) ? { blocks: parsed } : parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    const rawBlocks = Array.isArray(payload.blocks) ? payload.blocks : [];
    const blocks = rawBlocks
      .map((item, index) => this.normalizeBlock(item, index, rawBlocks.length))
      .filter((item): item is PositionedOcrBlock => Boolean(item));
    const declaredText = typeof payload.text === "string" ? payload.text.trim() : "";
    const text = declaredText || blocks.map((block) => block.text).join("\n").trim();
    return {
      text,
      blocks: blocks.length > 0 ? blocks : text ? [{ text, x: 0.03, y: 0.03, width: 0.94, height: 0.12 }] : []
    };
  }

  private normalizeBlock(value: unknown, index: number, total: number): PositionedOcrBlock | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    const text = this.stringValue(item.text ?? item.originalText ?? item.original);
    if (!text) return null;
    const translatedText = this.stringValue(item.translatedText ?? item.translation ?? item.translated);
    const colorValue = (candidate: unknown) => {
      const value = this.stringValue(candidate);
      return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
    };
    const fontColor = colorValue(item.fontColor ?? item.textColor);
    const backgroundColor = colorValue(item.backgroundColor ?? item.bgColor);
    const fontWeight = this.stringValue(item.fontWeight).toLowerCase() === "bold" ? "bold" as const : "normal" as const;
    const requestedTextAlign = this.stringValue(item.textAlign).toLowerCase();
    const textAlign = (["left", "center", "right"] as const).find((value) => value === requestedTextAlign) ?? "left";
    const bbox = Array.isArray(item.bbox) ? item.bbox : Array.isArray(item.box) ? item.box : null;
    let x = this.numberValue(item.x ?? item.left);
    let y = this.numberValue(item.y ?? item.top);
    let width = this.numberValue(item.width ?? item.w);
    let height = this.numberValue(item.height ?? item.h);
    if (bbox && bbox.length >= 4) {
      const x1 = this.numberValue(bbox[0]);
      const y1 = this.numberValue(bbox[1]);
      const x2 = this.numberValue(bbox[2]);
      const y2 = this.numberValue(bbox[3]);
      if ([x1, y1, x2, y2].every((number) => number !== null)) {
        x = x1;
        y = y1;
        width = Math.max(0, (x2 as number) - (x1 as number));
        height = Math.max(0, (y2 as number) - (y1 as number));
      }
    }
    const values = [x, y, width, height].filter((number): number is number => number !== null);
    const divisor = values.some((number) => Math.abs(number) > 1) ? 1000 : 1;
    const fallbackHeight = Math.max(0.04, 0.9 / Math.max(1, total));
    const normalizedX = this.clamp((x ?? 0.03) / divisor, 0, 0.99);
    const normalizedY = this.clamp((y ?? (0.04 + index * fallbackHeight)) / divisor, 0, 0.99);
    const normalizedWidth = this.clamp((width ?? 0.94) / divisor, 0.01, 1 - normalizedX);
    const normalizedHeight = this.clamp((height ?? fallbackHeight) / divisor, 0.02, 1 - normalizedY);
    return {
      text,
      x: normalizedX,
      y: normalizedY,
      width: normalizedWidth,
      height: normalizedHeight,
      ...(translatedText ? { translatedText } : {}),
      ...(fontColor ? { fontColor } : {}),
      ...(backgroundColor ? { backgroundColor } : {}),
      fontWeight,
      textAlign
    };
  }

  private stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  private numberValue(value: unknown) {
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isFinite(number) ? number : null;
  }

  private clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  private parseJsonResponse(text: string) {
    if (!text) return {};
    try { return JSON.parse(text) as unknown; } catch { return { message: text }; }
  }

  private normalizeBaseUrl(value: string) {
    return (value || "https://dashscope.aliyuncs.com/compatible-mode/v1").trim().replace(/\/+$/, "");
  }
}
