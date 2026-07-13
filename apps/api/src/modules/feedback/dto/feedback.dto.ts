import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class CreateFeedbackDto {
  @IsOptional()
  @IsIn(["general", "bug", "translation", "media", "call", "account"])
  category?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  attachmentUrl?: string;
}