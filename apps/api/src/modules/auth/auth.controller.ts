import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { ChangePasswordDto, LoginDto, RegisterDto, SendCodeDto, UpdateProfileDto } from "./dto/auth.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { AuthenticatedUser } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("send-code")
  sendCode(@Body() dto: SendCodeDto) {
    return this.auth.sendVerificationCode(dto);
  }

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }


  @Post("profile")
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Post("password")
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }
  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
