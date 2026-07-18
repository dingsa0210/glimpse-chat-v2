import { Body, Controller, Get, Post, Res, UseGuards } from "@nestjs/common";
import { BadRequestException, Header } from "@nestjs/common";
import { MEDIA_LIMITS } from "@glimpse/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MediaService } from "../media/media.service";
import { VoiceTranscriptionDto } from "./dto/voice-transcription.dto";
import { VoiceTranscriptionService } from "./voice-transcription.service";

@Controller("voice")
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceTranscriptionService, private readonly media: MediaService) {}

  @Get("tts/config")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  async ttsConfig() {
    return await this.voice.getTtsRuntimeConfig();
  }

  @Post("transcribe")
  async transcribe(@CurrentUser() _user: AuthenticatedUser, @Body() dto: VoiceTranscriptionDto) {
    const mimeType = dto.mimeType.trim().toLowerCase();
    if (!mimeType.startsWith("audio/")) throw new BadRequestException("Only audio input can be transcribed.");
    if (dto.size > MEDIA_LIMITS.audioMaxBytes) throw new BadRequestException("Audio exceeds the allowed size limit.");
    const encoded = dto.dataBase64.includes(",") ? dto.dataBase64.slice(dto.dataBase64.indexOf(",") + 1) : dto.dataBase64;
    const buffer = Buffer.from(encoded.trim(), "base64");
    if (!buffer.length) throw new BadRequestException("Audio input is empty.");
    if (buffer.length !== dto.size) throw new BadRequestException("Audio input size does not match the uploaded data.");
    const fileName = dto.fileName.trim() || "speech.webm";
    const temporaryMedia = this.media.saveUpload({
      fileName,
      mimeType,
      size: buffer.length,
      dataBase64: buffer.toString("base64")
    });
    try {
      const text = await this.voice.transcribeAudio({
        buffer,
        fileName,
        mimeType,
        mediaUrl: temporaryMedia.url
      });
      return { text };
    } finally {
      this.media.removeMediaFileByUrl(temporaryMedia.url);
    }
  }

  @Post("tts")
  async synthesize(@Body() body: { text?: string; language?: string; voiceType?: string }, @Res() response: any) {
    const audio = await this.voice.synthesizeSpeech({ text: body.text ?? "", language: body.language, voiceType: body.voiceType });
    response.setHeader("Content-Type", audio.mimeType);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-TTS-Voice-Type", audio.voiceType);
    response.setHeader("X-TTS-Cache", audio.cacheStatus ?? "MISS");
    response.send(audio.buffer);
  }
}
