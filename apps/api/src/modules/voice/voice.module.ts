import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VoiceController } from "./voice.controller";
import { VoiceTranscriptionService } from "./voice-transcription.service";

@Module({
  imports: [AuthModule],
  controllers: [VoiceController],
  providers: [VoiceTranscriptionService],
  exports: [VoiceTranscriptionService]
})
export class VoiceModule {}


