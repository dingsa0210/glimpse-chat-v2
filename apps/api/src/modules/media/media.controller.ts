import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UploadMediaDto } from "./dto/upload-media.dto";
import { MediaService } from "./media.service";
import type { OfficeConversionRequest } from "@glimpse/shared";

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

  @Get("previews/:fileName")
  previewDocument(@Param("fileName") fileName: string, @Query("name") name: string | undefined) {
    return this.media.previewDocument(fileName, name);
  }

  @Post("documents/:fileName/convert")
  @UseGuards(JwtAuthGuard)
  convertDocument(@CurrentUser() _user: AuthenticatedUser, @Param("fileName") fileName: string, @Query("name") name: string | undefined, @Body() body: OfficeConversionRequest) {
    return this.media.convertOfficeDocument(fileName, name, body);
  }

  @Get("files/:fileName")
  getFile(@Param("fileName") fileName: string, @Query("name") name: string | undefined, @Query("download") download: string | undefined, @Req() request: { headers: { range?: string } }, @Res({ passthrough: true }) response: { statusCode: number; setHeader(name: string, value: string): void }) {
    return this.media.streamFile(fileName, response, name, download === "1" || download === "true", request.headers.range);
  }
}

