import { IsInt, IsString, MaxLength, Min } from "class-validator";

export class UploadMediaDto {
  @IsString()
  @MaxLength(160)
  fileName!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsInt()
  @Min(1)
  size!: number;

  @IsString()
  dataBase64!: string;
}