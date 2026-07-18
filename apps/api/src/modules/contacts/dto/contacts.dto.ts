import { SUPPORTED_TRANSLATION_LANGUAGES, type TranslationLanguage } from "@glimpse/shared";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDirectConversationDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}


export class CreateGroupConversationDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  userIds!: string[];
}
export class InviteGroupMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];
}

export class UpdateGroupProfileDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  announcement?: string;

  @IsOptional()
  @IsBoolean()
  announcementScroll?: boolean;
}

export class TranslateMessageDto {
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  targetLanguage!: TranslationLanguage;
}
export class EditTranslationDto {
  @IsIn(SUPPORTED_TRANSLATION_LANGUAGES)
  targetLanguage!: TranslationLanguage;

  @IsString()
  body!: string;

  // Kept as a compatibility fallback for older clients that used editedBody.
  @IsOptional()
  @IsString()
  editedBody?: string;
}

export class CreateFriendRequestDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}

export class UpdateContactTagsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags!: string[];
}

export class UpdateContactMemoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(4000000, { each: true })
  images?: string[];
}

