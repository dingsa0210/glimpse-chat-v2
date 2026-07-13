import { BadRequestException, Injectable, NotFoundException, StreamableFile } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MEDIA_LIMITS, type ArchivePreviewEntry, type ArchivePreviewResponse, type UploadedMediaResponse } from "@glimpse/shared";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { UploadMediaDto } from "./dto/upload-media.dto";

type HeaderWriter = { setHeader(name: string, value: string): void };

const blockedExtensions = new Set([".exe", ".bat", ".cmd", ".com", ".msi", ".ps1", ".js", ".mjs", ".vbs", ".scr", ".jar", ".apk"]);
const extensionByMime = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
  ["video/x-m4v", ".m4v"],
  ["video/x-matroska", ".mkv"],
  ["video/3gpp", ".3gp"],
  ["video/3gpp2", ".3g2"],
  ["application/mp4", ".mp4"],
  ["video/mpeg", ".mpeg"],
  ["application/vnd.rn-realmedia", ".rm"],
  ["application/vnd.rn-realmedia-vbr", ".rmvb"],
  ["video/x-msvideo", ".avi"],
  ["video/x-ms-wmv", ".wmv"],
  ["video/x-flv", ".flv"],
  ["video/mp2t", ".ts"],
  ["video/dvd", ".vob"],
  ["video/ogg", ".ogv"],
  ["audio/mpeg", ".mp3"],
  ["audio/mp4", ".m4a"],
  ["audio/aac", ".aac"],
  ["audio/wav", ".wav"],
  ["audio/webm", ".webm"],
  ["audio/ogg", ".ogg"],
  ["application/pdf", ".pdf"],
  ["text/plain", ".txt"],
  ["text/csv", ".csv"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.ms-powerpoint", ".ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
  ["application/zip", ".zip"],
  ["application/x-zip-compressed", ".zip"]
]);

@Injectable()
export class MediaService {
  private readonly storageDir: string;
  private readonly lookupDirs: string[];

  constructor(private readonly config: ConfigService) {
    const cwd = process.cwd();
    const repoRoot = cwd.endsWith(join("apps", "api")) ? resolve(cwd, "..", "..") : cwd;
    const configuredStorageDir = this.config.get<string>("MEDIA_STORAGE_DIR")
      ?? this.config.get<string>("MEDIA_UPLOAD_DIR")
      ?? join(repoRoot, "99_输出结果", "glimpse-media-uploads");
    const primaryStorageDir = resolve(configuredStorageDir);
    const legacyApiStorageDir = resolve(repoRoot, "apps", "api", "99_输出结果", "glimpse-media-uploads");
    const cwdStorageDir = resolve(cwd, "99_输出结果", "glimpse-media-uploads");
    this.storageDir = primaryStorageDir;
    this.lookupDirs = Array.from(new Set([this.storageDir, legacyApiStorageDir, cwdStorageDir]));
    mkdirSync(this.storageDir, { recursive: true });
  }

  saveUpload(dto: UploadMediaDto): UploadedMediaResponse {
    const mimeType = dto.mimeType.toLowerCase();
    const originalExtension = extname(dto.fileName).toLowerCase();
    if (blockedExtensions.has(originalExtension)) throw new BadRequestException("This file type is not allowed.");
    const kind = this.kindForUpload(mimeType, originalExtension);
    const maxBytes = kind === "image" ? MEDIA_LIMITS.imageMaxBytes : kind === "video" ? MEDIA_LIMITS.videoMaxBytes : kind === "audio" ? MEDIA_LIMITS.audioMaxBytes : MEDIA_LIMITS.fileMaxBytes;
    if (dto.size > maxBytes) throw new BadRequestException(`${kind} exceeds the allowed size limit.`);

    const base64 = dto.dataBase64.includes(",") ? dto.dataBase64.split(",").pop() ?? "" : dto.dataBase64;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) throw new BadRequestException("Uploaded file is empty.");
    if (buffer.length !== dto.size) throw new BadRequestException("Uploaded file size does not match the declared size.");
    if (buffer.length > maxBytes) throw new BadRequestException(`${kind} exceeds the allowed size limit.`);

    const extension = extensionByMime.get(mimeType) ?? (originalExtension || ".bin");
    const originalName = this.cleanFileName(dto.fileName);
    const storedName = `${Date.now()}-${randomUUID()}${extension}`;
    const target = resolve(this.storageDir, storedName);
    if (!target.startsWith(this.storageDir)) throw new BadRequestException("Invalid upload target.");
    writeFileSync(target, buffer);

    return {
      url: `/media/files/${storedName}?name=${encodeURIComponent(originalName)}`,
      fileName: originalName,
      mimeType,
      size: buffer.length,
      kind
    };
  }

  streamFile(fileName: string, response: HeaderWriter, originalName?: string, forceDownload = false) {
    const safeName = basename(fileName);
    if (safeName !== fileName) throw new NotFoundException("Media file was not found.");
    const filePath = this.resolveExistingFile(safeName);
    const fileSize = statSync(filePath).size;
    const contentType = this.mimeForExtension(extname(safeName).toLowerCase());
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Length", String(fileSize));
    response.setHeader("X-Content-Type-Options", "nosniff");
    const downloadName = this.cleanFileName(originalName || safeName);
    response.setHeader("Content-Disposition", this.contentDisposition(downloadName, forceDownload ? "attachment" : "inline"));
    return new StreamableFile(createReadStream(filePath));
  }

  previewArchive(fileName: string, originalName?: string): ArchivePreviewResponse {
    const safeName = basename(fileName);
    if (safeName !== fileName) throw new NotFoundException("Media file was not found.");
    if (extname(safeName).toLowerCase() !== ".zip") throw new BadRequestException("Only ZIP archive preview is supported.");
    const filePath = this.resolveExistingFile(safeName);
    const buffer = readFileSync(filePath);
    return this.readZipDirectory(buffer, this.cleanFileName(originalName || safeName));
  }

  readMediaFileByUrl(mediaUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(mediaUrl, "http://local");
    } catch {
      throw new BadRequestException("Invalid media URL.");
    }
    if (!parsed.pathname.startsWith("/media/files/")) throw new BadRequestException("Only uploaded media files can be processed.");
    const fileName = decodeURIComponent(parsed.pathname.replace("/media/files/", ""));
    const safeName = basename(fileName);
    if (!safeName || safeName !== fileName) throw new NotFoundException("Media file was not found.");
    const filePath = this.resolveExistingFile(safeName);
    const originalName = this.cleanFileName(parsed.searchParams.get("name") || safeName);
    const extension = extname(safeName).toLowerCase();
    return {
      buffer: readFileSync(filePath),
      fileName: originalName,
      mimeType: this.mimeForExtension(extension)
    };
  }

  private resolveExistingFile(fileName: string) {
    for (const directory of this.lookupDirs) {
      const target = resolve(directory, fileName);
      if (target.startsWith(directory) && existsSync(target)) return target;
    }
    throw new NotFoundException("Media file was not found.");
  }

  private readZipDirectory(buffer: Buffer, fileName: string): ArchivePreviewResponse {
    const eocdMinSize = 22;
    const maxCommentLength = 0xffff;
    const searchStart = Math.max(0, buffer.length - eocdMinSize - maxCommentLength);
    let eocdOffset = -1;
    for (let offset = buffer.length - eocdMinSize; offset >= searchStart; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }
    if (eocdOffset < 0) throw new BadRequestException("Invalid ZIP archive.");
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (centralDirectoryOffset + centralDirectorySize > buffer.length) throw new BadRequestException("Invalid ZIP archive directory.");

    const entries: ArchivePreviewEntry[] = [];
    const maxEntries = 300;
    let offset = centralDirectoryOffset;
    for (let index = 0; index < totalEntries && offset + 46 <= buffer.length; index += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
      const flags = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const size = buffer.readUInt32LE(offset + 24);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const nameStart = offset + 46;
      const nameEnd = nameStart + fileNameLength;
      if (nameEnd > buffer.length) break;
      const rawName = buffer.subarray(nameStart, nameEnd);
      const name = (flags & 0x0800) !== 0 ? rawName.toString("utf8") : rawName.toString("latin1");
      if (entries.length < maxEntries) {
        entries.push({ name, size, compressedSize, directory: name.endsWith("/") });
      }
      offset = nameEnd + extraLength + commentLength;
    }

    return { fileName, totalEntries, entries, truncated: totalEntries > entries.length };
  }

  private kindForUpload(mimeType: string, extension: string): "image" | "video" | "audio" | "file" {
    if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) return "image";
    if (mimeType.startsWith("video/") || mimeType === "application/mp4" || [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".3gp", ".3gpp", ".3g2", ".mpeg", ".mpg", ".mpe", ".rm", ".rmvb", ".avi", ".wmv", ".flv", ".f4v", ".ts", ".mts", ".m2ts", ".vob", ".ogv"].includes(extension)) return "video";
    if (mimeType.startsWith("audio/") || [".mp3", ".m4a", ".aac", ".wav", ".webm", ".ogg", ".flac"].includes(extension)) return "audio";
    return "file";
  }

  private mimeForExtension(extension: string) {
    for (const [mimeType, ext] of extensionByMime.entries()) {
      if (ext === extension) return mimeType;
    }
    return "application/octet-stream";
  }

  private cleanFileName(value: string) {
    return basename(value).replace(/[\\/:*?"<>|]/g, "_").slice(0, 160) || "media";
  }

  private contentDisposition(fileName: string, disposition: "inline" | "attachment") {
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "media";
    return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }
}

