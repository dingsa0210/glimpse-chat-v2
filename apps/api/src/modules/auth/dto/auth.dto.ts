import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SendCodeDto {
  @IsEmail()
  email!: string;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  nickname!: string;

  @IsOptional()
  @IsIn(["zh", "en"])
  language?: "zh" | "en";

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  publicId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  signature?: string;

  @IsOptional()
  @IsBoolean()
  profilePublic?: boolean;

  @IsOptional()
  @IsBoolean()
  profileEmailPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  profilePhonePublic?: boolean;
}
