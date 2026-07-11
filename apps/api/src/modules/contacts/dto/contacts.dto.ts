import { SUPPORTED_TRANSLATION_LANGUAGES, type TranslationLanguage } from "@glimpse/shared";
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";

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
export class CreateFriendRequestDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}

