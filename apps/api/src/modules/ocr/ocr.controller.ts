import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { TRANSLATION_LANGUAGE_OPTIONS, type TranslationLanguage } from "@glimpse/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OcrService } from "./ocr.service";

@Controller("ocr")
@UseGuards(JwtAuthGuard)
export class OcrController {
  constructor(private readonly ocr: OcrService) {}

  @Post("image")
  async recognizeImage(@CurrentUser() _user: AuthenticatedUser, @Body() body: { dataBase64?: unknown; mimeType?: unknown; targetLanguage?: unknown }) {
    const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64.trim() : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
    if (!dataBase64) throw new BadRequestException("Image data is required for OCR.");
    if (!mimeType.startsWith("image/")) throw new BadRequestException("Only image input can be recognized by OCR.");
    const encoded = dataBase64.includes(",") ? dataBase64.slice(dataBase64.indexOf(",") + 1) : dataBase64;
    const buffer = Buffer.from(encoded, "base64");
    if (!buffer.length) throw new BadRequestException("Image input is empty.");
    if (buffer.length > 12 * 1024 * 1024) throw new BadRequestException("Image exceeds the OCR size limit of 12 MB.");
    const requestedLanguage = typeof body.targetLanguage === "string" ? body.targetLanguage.trim() : "";
    const targetLanguage = requestedLanguage && TRANSLATION_LANGUAGE_OPTIONS.some((item) => item.code === requestedLanguage)
      ? requestedLanguage as TranslationLanguage
      : undefined;
    if (requestedLanguage && !targetLanguage) throw new BadRequestException("Unsupported OCR translation language.");
    return this.ocr.recognizeImage({ dataBase64: buffer.toString("base64"), mimeType, size: buffer.length, targetLanguage });
  }
}
