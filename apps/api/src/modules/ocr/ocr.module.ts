import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OcrController } from "./ocr.controller";
import { OcrService } from "./ocr.service";

@Module({
  imports: [AuthModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService]
})
export class OcrModule {}
