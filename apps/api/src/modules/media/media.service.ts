import { BadRequestException, Injectable, NotFoundException, StreamableFile } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MEDIA_LIMITS, type ArchivePreviewEntry, type ArchivePreviewResponse, type DocumentPreviewResponse, type OfficeConversionFormat, type OfficeConversionRequest, type UploadedMediaResponse } from "@glimpse/shared";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, parse, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import type { UploadMediaDto } from "./dto/upload-media.dto";

type HeaderWriter = { statusCode?: number; setHeader(name: string, value: string): void };
const execFileAsync = promisify(execFile);

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
  ["image/vnd.dxf", ".dxf"],
  ["image/vnd.dwg", ".dwg"],
  ["application/acad", ".dwg"],
  ["application/x-caxa-exb", ".exb"],
  ["application/zip", ".zip"],
  ["application/x-zip-compressed", ".zip"]
]);

@Injectable()
export class MediaService {
  private readonly storageDir: string;
  private readonly lookupDirs: string[];
  private caxaPreviewQueue: Promise<void> = Promise.resolve();

  constructor(private readonly config: ConfigService) {
    const cwd = process.cwd();
    const repoRoot = cwd.endsWith(join("apps", "api")) ? resolve(cwd, "..", "..") : cwd;
    const primaryStorageDir = resolve(this.config.get<string>("MEDIA_STORAGE_DIR", join(repoRoot, "99_输出结果", "glimpse-media-uploads")));
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

    const cadExtensions = new Set([".dxf", ".dwg", ".exb", ".caxa"]);
    const extension = cadExtensions.has(originalExtension) ? originalExtension : extensionByMime.get(mimeType) ?? (originalExtension || ".bin");
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

  saveGeneratedFile(buffer: Buffer, fileName: string, mimeType: string): UploadedMediaResponse {
    if (!buffer.length) throw new BadRequestException("Generated file is empty.");
    if (buffer.length > MEDIA_LIMITS.fileMaxBytes) throw new BadRequestException("Generated file exceeds the allowed size limit.");
    const originalName = this.cleanFileName(fileName);
    const extension = extname(originalName).toLowerCase() || extensionByMime.get(mimeType.toLowerCase()) || ".bin";
    if (blockedExtensions.has(extension)) throw new BadRequestException("This generated file type is not allowed.");
    const storedName = `${Date.now()}-${randomUUID()}${extension}`;
    writeFileSync(resolve(this.storageDir, storedName), buffer);
    return { url: `/media/files/${storedName}?name=${encodeURIComponent(originalName)}`, fileName: originalName, mimeType, size: buffer.length, kind: "file" };
  }

  streamFile(fileName: string, response: HeaderWriter, originalName?: string, forceDownload = false, rangeHeader?: string) {
    const safeName = basename(fileName);
    if (safeName !== fileName) throw new NotFoundException("Media file was not found.");
    const filePath = this.resolveExistingFile(safeName);
    const fileSize = statSync(filePath).size;
    const contentType = this.mimeForExtension(extname(safeName).toLowerCase());
    response.setHeader("Content-Type", contentType);
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const downloadName = this.cleanFileName(originalName || safeName);
    response.setHeader("Content-Disposition", this.contentDisposition(downloadName, forceDownload ? "attachment" : "inline"));
    const range = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/i);
    if (range) {
      const requestedStart = range[1] ? Number(range[1]) : 0;
      const requestedEnd = range[2] ? Number(range[2]) : fileSize - 1;
      const start = Math.max(0, Math.min(requestedStart, fileSize - 1));
      const end = Math.max(start, Math.min(requestedEnd, fileSize - 1));
      response.statusCode = 206;
      response.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      response.setHeader("Content-Length", String(end - start + 1));
      return new StreamableFile(createReadStream(filePath, { start, end }));
    }
    response.setHeader("Content-Length", String(fileSize));
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

  async previewDocument(fileName: string, originalName?: string): Promise<DocumentPreviewResponse> {
    const safeName = basename(fileName);
    if (safeName !== fileName) throw new NotFoundException("Media file was not found.");
    const filePath = this.resolveExistingFile(safeName);
    const displayName = this.cleanFileName(originalName || safeName);
    const extension = extname(displayName || safeName).toLowerCase() || extname(safeName).toLowerCase();
    const mimeType = this.mimeForExtension(extension);
    if (extension === ".pdf") {
      if (statSync(filePath).size >= 20 * 1024 * 1024) {
        const raster = await this.createLargePdfPreview(filePath, safeName, displayName);
        if (raster) return { fileName: displayName, mimeType: "application/pdf", kind: "image", url: raster, warning: "This complex PDF is displayed as a high-resolution first-page rendering for reliable zooming. Download the original for all pages.", engine: "pymupdf-pdf" };
      }
      return { fileName: displayName, mimeType: "application/pdf", kind: "pdf", url: this.mediaUrl(safeName, displayName), engine: "pdfjs" };
    }
    if ([".txt", ".md", ".csv", ".json", ".log"].includes(extension)) {
      return { fileName: displayName, mimeType, kind: "text", content: readFileSync(filePath, "utf8").slice(0, 600_000), engine: "local-text" };
    }
    if (extension === ".docx") {
      const rendered = await mammoth.convertToHtml({ buffer: readFileSync(filePath) });
      return {
        fileName: displayName,
        mimeType,
        kind: "html",
        content: rendered.value,
        warning: rendered.messages.length ? "Some advanced Word layout may be simplified in the browser preview." : undefined,
        engine: "mammoth-docx"
      };
    }
    if ([".doc", ".rtf", ".wps", ".odt"].includes(extension)) {
      const convertedDocx = await this.convertWordToDocxBuffer(filePath, displayName);
      if (convertedDocx) {
        const rendered = await mammoth.convertToHtml({ buffer: convertedDocx });
        return {
          fileName: displayName,
          mimeType,
          kind: "html",
          content: rendered.value,
          warning: "This legacy word-processing file was converted to a continuous browser document; some advanced layout may be simplified.",
          engine: "libreoffice-mammoth"
        };
      }
    }
    if (extension === ".xlsx" || extension === ".xls") {
      const workbook = XLSX.read(readFileSync(filePath), { type: "buffer", cellDates: true });
      let truncated = false;
      const sheets = workbook.SheetNames.map((name) => {
        const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(workbook.Sheets[name]!, { header: 1, raw: false, defval: "" });
        if (rows.length > 5000 || rows.some((row) => row.length > 200)) truncated = true;
        return { name, rows: rows.slice(0, 5000).map((row) => row.slice(0, 200)) };
      });
      return {
        fileName: displayName,
        mimeType,
        kind: "spreadsheet",
        content: JSON.stringify({ sheets }),
        warning: truncated ? "The browser preview shows the first 5,000 rows and 200 columns of each sheet; download the original for the remaining cells." : undefined,
        engine: "sheetjs-workbook"
      };
    }
    if ([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".wps", ".et", ".dps"].includes(extension)) {
      const converted = await this.convertOfficeToPdf(filePath, safeName, displayName);
      if (converted) return { fileName: displayName, mimeType, kind: [".ppt", ".pptx", ".odp", ".dps"].includes(extension) ? "presentation" : "pdf", url: converted, engine: "libreoffice" };
      const thumbnail = await this.createShellPreview(filePath, safeName, displayName);
      if (thumbnail) return { fileName: displayName, mimeType, kind: "image", url: thumbnail, warning: "The local Office converter was unavailable; showing the Windows document preview.", engine: "windows-shell" };
    }
    if (extension === ".dxf") {
      const svg = this.dxfToSvg(readFileSync(filePath, "utf8"));
      if (svg) return { fileName: displayName, mimeType, kind: "svg", content: svg, engine: "local-dxf" };
    }
    if (extension === ".dwg") {
      const dxf = await this.convertDwgToDxf(filePath, safeName);
      if (dxf) {
        const svg = this.dxfToSvg(await readFile(dxf, "utf8"));
        if (svg) {
          if (svg.length > 1_500_000) {
            const raster = await this.createCadSvgPreview(svg, safeName, displayName);
            if (raster) return { fileName: displayName, mimeType, kind: "image", url: raster, warning: "This complex DWG was converted by ODA and rendered as a high-resolution drawing for reliable browser zooming.", engine: "oda-dwg-raster" };
          }
          return { fileName: displayName, mimeType, kind: "svg", content: svg, engine: "oda-dwg" };
        }
      }
      return { fileName: displayName, mimeType, kind: "unsupported", warning: "The DWG file could not be converted into real drawing geometry. An application icon is not used as a preview; verify the ODA converter or download the original." };
    }
    if ([".exb", ".caxa"].includes(extension)) {
      const vectorPreview = await this.createCaxaVectorPreview(filePath, safeName);
      if (vectorPreview) {
        return { fileName: displayName, mimeType, kind: "svg", content: await readFile(vectorPreview, "utf8"), engine: "caxa-objectcrx-svg" };
      }
      const thumbnail = await this.createShellPreview(filePath, safeName, displayName, true);
      if (thumbnail) return { fileName: displayName, mimeType, kind: "image", url: thumbnail, warning: "This CAXA/EXB file only exposes an embedded low-resolution thumbnail through the installed preview handler. The original file remains available for download; this image is not represented as an HD or full-geometry preview.", engine: "caxa-embedded-thumbnail" };
      return { fileName: displayName, mimeType, kind: "unsupported", warning: "The CAXA/EXB file did not provide a real drawing preview. File-name, application-icon and placeholder thumbnails are rejected; download the original or verify the installed CAXA preview handler." };
    }
    return { fileName: displayName, mimeType, kind: "unsupported", warning: "This document has no installed local browser preview adapter. Download it to open with the associated desktop application." };
  }

  readStoredDocument(fileName: string, originalName?: string) {
    const safeName = basename(fileName);
    if (!safeName || safeName !== fileName) throw new NotFoundException("Media file was not found.");
    const filePath = this.resolveExistingFile(safeName);
    const displayName = this.cleanFileName(originalName || safeName);
    const extension = extname(displayName || safeName).toLowerCase() || extname(safeName).toLowerCase();
    return { buffer: readFileSync(filePath), fileName: displayName, mimeType: this.mimeForExtension(extension) };
  }

  async convertOfficeDocument(fileName: string, originalName: string | undefined, request: OfficeConversionRequest): Promise<UploadedMediaResponse> {
    const safeName = basename(fileName);
    if (safeName !== fileName) throw new NotFoundException("Media file was not found.");
    const filePath = this.resolveExistingFile(safeName);
    const displayName = this.cleanFileName(originalName || safeName);
    const sourceExtension = extname(displayName || safeName).toLowerCase() || extname(safeName).toLowerCase();
    const officeExtensions = new Set([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".wps", ".et", ".dps"]);
    if (!officeExtensions.has(sourceExtension)) throw new BadRequestException("Only Office and WPS documents can be repaired or converted.");
    const format = String(request?.format || "").toLowerCase() as OfficeConversionFormat;
    const filters: Record<OfficeConversionFormat, string> = {
      pdf: "pdf", doc: "doc:MS Word 97", docx: "docx:Office Open XML Text", xls: "xls:MS Excel 97", xlsx: "xlsx:Calc MS Excel 2007 XML",
      ppt: "ppt:MS PowerPoint 97", pptx: "pptx:Impress MS PowerPoint 2007 XML", odt: "odt:writer8", ods: "ods:calc8", odp: "odp:impress8"
    };
    if (!filters[format]) throw new BadRequestException("Unsupported Office output format.");
    const configured = this.config.get<string>("LIBREOFFICE_PATH", "").trim();
    const candidates = [configured, process.platform === "win32" ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe" : "", "soffice"].filter(Boolean);
    let lastError = "LibreOffice did not produce an output file.";
    for (const executable of candidates) {
      const workDir = await mkdtemp(join(tmpdir(), "glimpse-office-convert-"));
      const outputDir = join(workDir, "output");
      mkdirSync(outputDir, { recursive: true });
      try {
        const sourceBase = parse(displayName).name || "document";
        const inputPath = join(workDir, `${sourceBase}${sourceExtension}`);
        await copyFile(filePath, inputPath);
        const profile = pathToFileURL(join(workDir, "profile")).href;
        await execFileAsync(executable, [`-env:UserInstallation=${profile}`, "--headless", "--convert-to", filters[format], "--outdir", outputDir, inputPath], { timeout: 180_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        const output = (await readdir(outputDir)).find((name) => extname(name).toLowerCase() === `.${format}`);
        if (!output) continue;
        const requestedBase = request.fileName ? parse(this.cleanFileName(request.fileName)).name : sourceBase;
        const outputName = `${requestedBase || sourceBase}.${format}`;
        const buffer = await readFile(join(outputDir, output));
        return this.saveGeneratedFile(buffer, outputName, this.mimeForExtension(`.${format}`));
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    }
    throw new BadRequestException(`Office repair/conversion failed: ${lastError}`);
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

  removeMediaFileByUrl(mediaUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(mediaUrl, "http://local");
    } catch {
      return;
    }
    if (!parsed.pathname.startsWith("/media/files/")) return;
    const fileName = decodeURIComponent(parsed.pathname.replace("/media/files/", ""));
    const safeName = basename(fileName);
    if (!safeName || safeName !== fileName) return;
    for (const directory of this.lookupDirs) {
      const target = resolve(directory, safeName);
      if (!target.startsWith(directory) || !existsSync(target)) continue;
      try {
        unlinkSync(target);
      } catch {
        // Temporary ASR media cleanup is best effort.
      }
      return;
    }
  }

  mediaFileSizeByUrl(mediaUrl?: string | null) {
    if (!mediaUrl) return undefined;
    try {
      const parsed = new URL(mediaUrl, "http://local");
      if (!parsed.pathname.startsWith("/media/files/")) return undefined;
      const fileName = decodeURIComponent(parsed.pathname.replace("/media/files/", ""));
      const safeName = basename(fileName);
      if (!safeName || safeName !== fileName) return undefined;
      return statSync(this.resolveExistingFile(safeName)).size;
    } catch {
      return undefined;
    }
  }

  private mediaUrl(storedName: string, displayName: string) {
    return `/media/files/${encodeURIComponent(storedName)}?name=${encodeURIComponent(displayName)}`;
  }

  private async convertOfficeToPdf(filePath: string, safeName: string, displayName: string) {
    const cachedName = `${parse(safeName).name}-office-preview.pdf`;
    const cachedPath = resolve(this.storageDir, cachedName);
    if (existsSync(cachedPath)) return this.mediaUrl(cachedName, `${parse(displayName).name}.pdf`);
    const configured = this.config.get<string>("LIBREOFFICE_PATH", "").trim();
    const candidates = [configured, process.platform === "win32" ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe" : "", "soffice"].filter(Boolean);
    for (const executable of candidates) {
      const workDir = await mkdtemp(join(tmpdir(), "glimpse-office-preview-"));
      try {
        const inputPath = join(workDir, `${parse(displayName).name || "document"}${extname(displayName) || extname(filePath)}`);
        await copyFile(filePath, inputPath);
        const profile = pathToFileURL(join(workDir, "profile")).href;
        await execFileAsync(executable, [`-env:UserInstallation=${profile}`, "--headless", "--convert-to", "pdf", "--outdir", workDir, inputPath], { timeout: 180_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
        const output = (await readdir(workDir)).find((name) => extname(name).toLowerCase() === ".pdf");
        if (!output) continue;
        await copyFile(join(workDir, output), cachedPath);
        return this.mediaUrl(cachedName, `${parse(displayName).name}.pdf`);
      } catch {
        // Try the next configured/local executable, then use the shell preview fallback.
      } finally { await rm(workDir, { recursive: true, force: true }); }
    }
    return "";
  }

  private async convertWordToDocxBuffer(filePath: string, displayName: string) {
    const configured = this.config.get<string>("LIBREOFFICE_PATH", "").trim();
    const candidates = [configured, process.platform === "win32" ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe" : "", "soffice"].filter(Boolean);
    for (const executable of candidates) {
      const workDir = await mkdtemp(join(tmpdir(), "glimpse-word-preview-"));
      try {
        const inputPath = join(workDir, `${parse(displayName).name || "document"}${extname(displayName) || extname(filePath)}`);
        await copyFile(filePath, inputPath);
        const profile = pathToFileURL(join(workDir, "profile")).href;
        await execFileAsync(executable, [`-env:UserInstallation=${profile}`, "--headless", "--convert-to", "docx:Office Open XML Text", "--outdir", workDir, inputPath], { timeout: 180_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
        const output = (await readdir(workDir)).find((name) => extname(name).toLowerCase() === ".docx");
        if (output) return await readFile(join(workDir, output));
      } catch {
        // Try the next configured/local executable, then use the PDF/shell fallback.
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    }
    return null;
  }

  private async convertDwgToDxf(filePath: string, safeName: string) {
    const converter = this.config.get<string>("ODA_FILE_CONVERTER_PATH", "").trim()
      || (process.platform === "win32" ? "C:\\Program Files\\ODA\\ODAFileConverter 27.1.0\\ODAFileConverter.exe" : "");
    if (!converter || (!existsSync(converter) && converter.includes("\\"))) return "";
    const workDir = await mkdtemp(join(tmpdir(), "glimpse-dwg-preview-"));
    const inputDir = join(workDir, "input");
    const outputDir = join(workDir, "output");
    mkdirSync(inputDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    try {
      await copyFile(filePath, join(inputDir, safeName));
      await execFileAsync(converter, [inputDir, outputDir, "ACAD2018", "DXF", "0", "1", `*.${extname(safeName).slice(1)}`], { timeout: 180_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      const output = (await readdir(outputDir)).find((name) => extname(name).toLowerCase() === ".dxf");
      if (!output) return "";
      const cachedName = `${parse(safeName).name}-cad-preview.dxf`;
      const cachedPath = resolve(this.storageDir, cachedName);
      await copyFile(join(outputDir, output), cachedPath);
      return cachedPath;
    } catch { return ""; }
    finally { await rm(workDir, { recursive: true, force: true }); }
  }

  private async createShellPreview(filePath: string, safeName: string, displayName: string, requireDrawingGeometry = false) {
    if (process.platform !== "win32") return "";
    const cachedName = `${parse(safeName).name}-${requireDrawingGeometry ? "cad-shell-preview-v5-hd" : "shell-preview-v3"}.png`;
    const cachedPath = resolve(this.storageDir, cachedName);
    const minimumBytes = requireDrawingGeometry ? 10_000 : 100;
    if (existsSync(cachedPath) && statSync(cachedPath).size > minimumBytes) return this.mediaUrl(cachedName, `${parse(displayName).name}-preview.png`);
    const scriptPath = resolve(__dirname, "..", "..", "..", "scripts", "windows-shell-preview.ps1");
    const sourceScript = existsSync(scriptPath) ? scriptPath : resolve(process.cwd(), "apps", "api", "scripts", "windows-shell-preview.ps1");
    if (!existsSync(sourceScript)) return "";
    try {
      const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", sourceScript, "-InputPath", filePath, "-OutputPath", cachedPath, "-Width", requireDrawingGeometry ? "4096" : "3600", "-Height", requireDrawingGeometry ? "4096" : "3000"];
      if (requireDrawingGeometry) args.push("-RequireDrawingGeometry");
      await execFileAsync("powershell.exe", args, { timeout: 120_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      return existsSync(cachedPath) && statSync(cachedPath).size > minimumBytes ? this.mediaUrl(cachedName, `${parse(displayName).name}-preview.png`) : "";
    } catch { return ""; }
  }

  private async createCaxaVectorPreview(filePath: string, safeName: string) {
    if (process.platform !== "win32") return "";
    const cachedName = `${parse(safeName).name}-caxa-vector-v132.svg`;
    const cachedPath = resolve(this.storageDir, cachedName);
    if (existsSync(cachedPath) && statSync(cachedPath).size > 10_000) return cachedPath;

    const executable = this.config.get<string>("CAXA_CAD_PATH", "").trim()
      || "C:\\Program Files\\CAXA\\CAXA CAD\\2024\\Bin64\\CDRAFT_M.exe";
    const installedPlugin = this.config.get<string>("CAXA_CRX_PLUGIN_PATH", "").trim()
      || "C:\\Program Files\\CAXA\\CAXA CAD\\2024\\Modules\\GlimpseCaxaConverter.crx";
    if (!existsSync(executable) || !existsSync(installedPlugin)) return "";

    let releaseQueue!: () => void;
    const previous = this.caxaPreviewQueue;
    this.caxaPreviewQueue = new Promise<void>((resolveQueue) => { releaseQueue = resolveQueue; });
    await previous;
    const statusPath = resolve(this.storageDir, `${parse(safeName).name}-caxa-vector-v132-${randomUUID()}.status`);
    let child: ReturnType<typeof spawn> | undefined;
    try {
      if (existsSync(cachedPath) && statSync(cachedPath).size > 10_000) return cachedPath;
      child = spawn(executable, [filePath], {
        env: {
          ...process.env,
          GLIMPSE_CAXA_INPUT: filePath,
          GLIMPSE_CAXA_OUTPUT: cachedPath,
          GLIMPSE_CAXA_STATUS: statusPath
        },
        stdio: "ignore",
        windowsHide: true
      });
      let processEnded = false;
      let processError = false;
      child.once("exit", () => { processEnded = true; });
      child.once("error", () => { processError = true; });
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        if (existsSync(statusPath)) {
          const status = readFileSync(statusPath, "utf8");
          if (status.startsWith("svg:ok") && existsSync(cachedPath) && statSync(cachedPath).size > 10_000) return cachedPath;
          if (status.startsWith("read-error:") || status.startsWith("svg:error")) break;
        }
        if (processError || (processEnded && !existsSync(statusPath))) break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
      if (existsSync(cachedPath) && statSync(cachedPath).size <= 10_000) unlinkSync(cachedPath);
      return "";
    } catch {
      if (existsSync(cachedPath) && statSync(cachedPath).size <= 10_000) unlinkSync(cachedPath);
      return "";
    } finally {
      if (child && !child.killed) child.kill();
      if (existsSync(statusPath)) unlinkSync(statusPath);
      releaseQueue();
    }
  }

  private async createLargePdfPreview(filePath: string, safeName: string, displayName: string) {
    const cachedName = `${parse(safeName).name}-pdf-preview-v1.png`;
    const cachedPath = resolve(this.storageDir, cachedName);
    if (existsSync(cachedPath) && statSync(cachedPath).size > 1000) return this.mediaUrl(cachedName, `${parse(displayName).name}-preview.png`);
    const scriptPath = resolve(__dirname, "..", "..", "..", "scripts", "pdf-first-page-preview.py");
    const sourceScript = existsSync(scriptPath) ? scriptPath : resolve(process.cwd(), "apps", "api", "scripts", "pdf-first-page-preview.py");
    if (!existsSync(sourceScript)) return "";
    const python = this.config.get<string>("PYTHON_PATH", "").trim() || "python";
    try {
      await execFileAsync(python, [sourceScript, filePath, cachedPath, "2400", "3000"], { timeout: 180_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      return existsSync(cachedPath) && statSync(cachedPath).size > 1000 ? this.mediaUrl(cachedName, `${parse(displayName).name}-preview.png`) : "";
    } catch { return ""; }
  }

  private async createCadSvgPreview(svg: string, safeName: string, displayName: string) {
    const cachedName = `${parse(safeName).name}-cad-render-v116.png`;
    const cachedPath = resolve(this.storageDir, cachedName);
    if (existsSync(cachedPath) && statSync(cachedPath).size > 10_000) return this.mediaUrl(cachedName, `${parse(displayName).name}-cad-preview.png`);
    const workDir = await mkdtemp(join(tmpdir(), "glimpse-cad-render-"));
    const svgPath = join(workDir, "drawing.svg");
    const scriptPath = resolve(__dirname, "..", "..", "..", "scripts", "cad-svg-preview.py");
    const sourceScript = existsSync(scriptPath) ? scriptPath : resolve(process.cwd(), "apps", "api", "scripts", "cad-svg-preview.py");
    if (!existsSync(sourceScript)) return "";
    const python = this.config.get<string>("PYTHON_PATH", "").trim() || "python";
    try {
      await writeFile(svgPath, svg, "utf8");
      await execFileAsync(python, [sourceScript, svgPath, cachedPath, "3200", "2600"], { timeout: 240_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      return existsSync(cachedPath) && statSync(cachedPath).size > 10_000 ? this.mediaUrl(cachedName, `${parse(displayName).name}-cad-preview.png`) : "";
    } catch { return ""; }
    finally { await rm(workDir, { recursive: true, force: true }); }
  }

  private dxfToSvg(source: string) {
    const lines = source.replace(/\r/g, "").split("\n");
    const pairs: Array<{ code: number; value: string }> = [];
    for (let index = 0; index + 1 < lines.length; index += 2) {
      const code = Number(lines[index]?.trim());
      if (Number.isFinite(code)) pairs.push({ code, value: lines[index + 1]?.trim() ?? "" });
    }
    type DxfEntity = { type: string; values: Array<{ code: number; value: string }> };
    const sectionRecords = (sectionName: string) => {
      const records: DxfEntity[] = [];
      let active = false;
      let current: DxfEntity | null = null;
      for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[index]!;
        if (pair.code === 0 && pair.value === "SECTION" && pairs[index + 1]?.code === 2 && pairs[index + 1]?.value === sectionName) { active = true; index += 1; continue; }
        if (active && pair.code === 0 && pair.value === "ENDSEC") { if (current) records.push(current); break; }
        if (!active) continue;
        if (pair.code === 0) { if (current) records.push(current); current = { type: pair.value.toUpperCase(), values: [] }; }
        else current?.values.push(pair);
      }
      return records;
    };
    const entities = sectionRecords("ENTITIES");
    const blockRecords = sectionRecords("BLOCKS");
    const blocks = new Map<string, { baseX: number; baseY: number; entities: DxfEntity[] }>();
    let block: { name: string; baseX: number; baseY: number; entities: DxfEntity[] } | null = null;
    for (const record of blockRecords) {
      if (record.type === "BLOCK") {
        block = {
          name: record.values.find((item) => item.code === 2)?.value.toUpperCase() ?? "",
          baseX: Number(record.values.find((item) => item.code === 10)?.value ?? 0),
          baseY: Number(record.values.find((item) => item.code === 20)?.value ?? 0),
          entities: []
        };
      } else if (record.type === "ENDBLK") {
        if (block?.name) blocks.set(block.name, { baseX: block.baseX, baseY: block.baseY, entities: block.entities });
        block = null;
      } else block?.entities.push(record);
    }
    const number = (entity: DxfEntity, code: number, fallback = 0) => {
      const found = entity.values.find((item) => item.code === code);
      const parsed = found ? Number(found.value) : Number.NaN;
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const all = (entity: DxfEntity, code: number) => entity.values.filter((item) => item.code === code).map((item) => Number(item.value)).filter(Number.isFinite);
    const shapes: Array<{ markup: string; points: Array<[number, number]> }> = [];
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
    const identity: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const compose = (parent: Matrix, local: Matrix): Matrix => ({
      a: parent.a * local.a + parent.c * local.b, b: parent.b * local.a + parent.d * local.b,
      c: parent.a * local.c + parent.c * local.d, d: parent.b * local.c + parent.d * local.d,
      e: parent.a * local.e + parent.c * local.f + parent.e, f: parent.b * local.e + parent.d * local.f + parent.f
    });
    const point = (matrix: Matrix, x: number, y: number): [number, number] => [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f];
    const polyline = (points: Array<[number, number]>, closed = false) => {
      if (points.length < 2 || shapes.length >= 80_000) return;
      shapes.push({ points, markup: `<polyline points="${points.map(([x, y]) => `${x},${-y}`).join(" ")}"${closed ? ` fill="none"` : ""} />` });
    };
    const renderEntity = (entity: DxfEntity, matrix: Matrix, depth: number) => {
      if (shapes.length >= 80_000) return;
      if (entity.type === "LINE") {
        const points = [point(matrix, number(entity, 10), number(entity, 20)), point(matrix, number(entity, 11), number(entity, 21))];
        shapes.push({ points, markup: `<line x1="${points[0]![0]}" y1="${-points[0]![1]}" x2="${points[1]![0]}" y2="${-points[1]![1]}" />` });
      } else if (entity.type === "CIRCLE" || entity.type === "ARC") {
        const cx = number(entity, 10), cy = number(entity, 20), radius = Math.abs(number(entity, 40));
        if (!radius) return;
        const startDegrees = entity.type === "CIRCLE" ? 0 : number(entity, 50);
        let span = entity.type === "CIRCLE" ? 360 : ((number(entity, 51) - startDegrees) % 360 + 360) % 360;
        if (!span) span = 360;
        const steps = Math.max(16, Math.ceil(span / 10));
        polyline(Array.from({ length: steps + 1 }, (_, index) => { const angle = (startDegrees + span * index / steps) * Math.PI / 180; return point(matrix, cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)); }), entity.type === "CIRCLE");
      } else if (entity.type === "LWPOLYLINE") {
        const xs = all(entity, 10), ys = all(entity, 20);
        polyline(xs.slice(0, ys.length).map((x, index) => point(matrix, x, ys[index]!)), (Math.trunc(number(entity, 70)) & 1) === 1);
      } else if (entity.type === "SPLINE") {
        const xs = all(entity, 10), ys = all(entity, 20);
        polyline(xs.slice(0, ys.length).map((x, index) => point(matrix, x, ys[index]!)));
      } else if (entity.type === "ELLIPSE") {
        const cx = number(entity, 10), cy = number(entity, 20), majorX = number(entity, 11), majorY = number(entity, 21), ratio = Math.abs(number(entity, 40, 1));
        const start = number(entity, 41, 0), end = number(entity, 42, Math.PI * 2), steps = 48;
        const length = Math.hypot(majorX, majorY), minorX = length ? -majorY / length * length * ratio : 0, minorY = length ? majorX / length * length * ratio : 0;
        polyline(Array.from({ length: steps + 1 }, (_, index) => { const angle = start + (end - start) * index / steps; return point(matrix, cx + majorX * Math.cos(angle) + minorX * Math.sin(angle), cy + majorY * Math.cos(angle) + minorY * Math.sin(angle)); }), Math.abs(end - start - Math.PI * 2) < 0.01);
      } else if (entity.type === "SOLID" || entity.type === "3DFACE" || entity.type === "TRACE") {
        const vertices = [10, 11, 12, 13].map((code) => point(matrix, number(entity, code), number(entity, code + 10)));
        polyline([...vertices, vertices[0]!], true);
      } else if (entity.type === "TEXT" || entity.type === "MTEXT") {
        const [x, y] = point(matrix, number(entity, 10), number(entity, 20));
        const scale = Math.max(0.01, Math.hypot(matrix.a, matrix.b));
        const size = Math.max(1, Math.abs(number(entity, 40, 2.5)) * scale);
        const text = entity.values.find((item) => item.code === 1)?.value ?? "";
        if (text) shapes.push({ points: [[x, y]], markup: `<text x="${x}" y="${-y}" font-size="${size}" fill="currentColor" stroke="none">${escape(text.replace(/\\P/g, " "))}</text>` });
      } else if (entity.type === "INSERT" && depth < 6) {
        const name = entity.values.find((item) => item.code === 2)?.value.toUpperCase() ?? "";
        const definition = blocks.get(name);
        if (!definition) return;
        const angle = number(entity, 50) * Math.PI / 180, sx = number(entity, 41, 1), sy = number(entity, 42, 1), cos = Math.cos(angle), sin = Math.sin(angle);
        const a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy;
        const rows = Math.max(1, Math.trunc(number(entity, 71, 1))), columns = Math.max(1, Math.trunc(number(entity, 70, 1)));
        for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
          const insertX = number(entity, 10) + column * number(entity, 44), insertY = number(entity, 20) + row * number(entity, 45);
          const local: Matrix = { a, b, c, d, e: insertX - a * definition.baseX - c * definition.baseY, f: insertY - b * definition.baseX - d * definition.baseY };
          renderList(definition.entities, compose(matrix, local), depth + 1);
        }
      }
    };
    const renderList = (records: DxfEntity[], matrix: Matrix, depth: number) => {
      for (let index = 0; index < records.length && shapes.length < 80_000; index += 1) {
        const entity = records[index]!;
        if (entity.type === "POLYLINE") {
          const vertices: Array<[number, number]> = [];
          while (records[index + 1]?.type === "VERTEX") { index += 1; vertices.push(point(matrix, number(records[index]!, 10), number(records[index]!, 20))); }
          polyline(vertices, (Math.trunc(number(entity, 70)) & 1) === 1);
        } else if (entity.type !== "VERTEX" && entity.type !== "SEQEND") renderEntity(entity, matrix, depth);
      }
    };
    renderList(entities, identity, 0);
    if (!shapes.length) return "";
    let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY, minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
    for (const shape of shapes) for (const [x, sourceY] of shape.points) {
      const y = -sourceY;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY), padding = Math.max(width, height) * 0.03;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}" width="100%" height="100%" style="background:#fff;color:#111"><g fill="none" stroke="currentColor" stroke-width="${Math.max(width, height) / 1400}" vector-effect="non-scaling-stroke">${shapes.map((shape) => shape.markup).join("")}</g></svg>`;
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
      const extraEnd = nameEnd + extraLength;
      if (extraEnd > buffer.length) break;
      const rawName = buffer.subarray(nameStart, nameEnd);
      const extra = buffer.subarray(nameEnd, extraEnd);
      const name = this.decodeZipEntryName(rawName, extra, flags);
      if (entries.length < maxEntries) {
        entries.push({ name, size, compressedSize, directory: name.endsWith("/") });
      }
      offset = extraEnd + commentLength;
    }

    return { fileName, totalEntries, entries, truncated: totalEntries > entries.length };
  }

  private decodeZipEntryName(rawName: Buffer, extra: Buffer, flags: number) {
    const unicodePath = this.zipUnicodePath(extra);
    if (unicodePath) return unicodePath;
    if ((flags & 0x0800) !== 0) return rawName.toString("utf8").replace(/\u0000/g, "");

    try {
      const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(rawName);
      if (/[^\x00-\x7f]/.test(utf8)) return utf8.replace(/\u0000/g, "");
    } catch {
      // Older Windows ZIP tools often store Chinese names as GBK without the UTF-8 flag.
    }

    try {
      const gb18030 = new TextDecoder("gb18030", { fatal: true }).decode(rawName);
      if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(gb18030)) return gb18030.replace(/\u0000/g, "");
    } catch {
      // Fall through to the ZIP specification's original CP437 encoding.
    }

    const cp437 = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´≡±‗¾¶§÷¸°¨·¹³²■ ";
    return Array.from(rawName, (byte) => byte < 0x80 ? String.fromCharCode(byte) : cp437[byte - 0x80] ?? "�").join("").replace(/\u0000/g, "");
  }

  private zipUnicodePath(extra: Buffer) {
    let offset = 0;
    while (offset + 4 <= extra.length) {
      const id = extra.readUInt16LE(offset);
      const length = extra.readUInt16LE(offset + 2);
      const dataStart = offset + 4;
      const dataEnd = dataStart + length;
      if (dataEnd > extra.length) break;
      if (id === 0x7075 && length >= 5 && extra[dataStart] === 1) {
        try { return new TextDecoder("utf-8", { fatal: true }).decode(extra.subarray(dataStart + 5, dataEnd)).replace(/\u0000/g, ""); }
        catch { return ""; }
      }
      offset = dataEnd;
    }
    return "";
  }

  private kindForUpload(mimeType: string, extension: string): "image" | "video" | "audio" | "file" {
    // DWG/DXF MIME types start with image/, but the payload is a CAD document.
    // Extension wins so the original file is sent as a file card, never an <img>.
    if ([".dxf", ".dwg", ".exb", ".caxa"].includes(extension)) return "file";
    if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/") || mimeType === "application/mp4") return "video";
    if ([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"].includes(extension)) return "audio";
    if ([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".3gp", ".3gpp", ".3g2", ".mpeg", ".mpg", ".mpe", ".rm", ".rmvb", ".avi", ".wmv", ".flv", ".f4v", ".ts", ".mts", ".m2ts", ".vob", ".ogv"].includes(extension)) return "video";
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

