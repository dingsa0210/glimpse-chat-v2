import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UploadMediaDto } from "./dto/upload-media.dto";
import { MediaService } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("upload")
  @UseGuards(JwtAuthGuard)
  upload(@CurrentUser() _user: AuthenticatedUser, @Body() dto: UploadMediaDto) {
    return { media: this.media.saveUpload(dto) };
  }

  @Get("archives/:fileName")
  previewArchive(@Param("fileName") fileName: string, @Query("name") name: string | undefined) {
    return this.media.previewArchive(fileName, name);
  }

  @Get("files/:fileName")
  getFile(@Param("fileName") fileName: string, @Query("name") name: string | undefined, @Query("download") download: string | undefined, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    return this.media.streamFile(fileName, response, name, download === "1" || download === "true");
  }
}

