import { Body, Controller, Get, Post, Res, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { VoiceTranscriptionService } from "./voice-transcription.service";

@Controller("voice")
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceTranscriptionService) {}

  @Get("tts/config")
  async ttsConfig() {
    return await this.voice.getTtsRuntimeConfig();
  }

  @Post("tts")
  async synthesize(@Body() body: { text?: string; language?: string; voiceType?: string }, @Res() response: any) {
    const audio = await this.voice.synthesizeSpeech({ text: body.text ?? "", language: body.language, voiceType: body.voiceType });
    response.setHeader("Content-Type", audio.mimeType);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Doubao-Voice-Type", audio.voiceType);
    response.send(audio.buffer);
  }
}
