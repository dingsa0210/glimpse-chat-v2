import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { VerificationModule } from "../verification/verification.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AdminGuard } from "./admin.guard";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({
  imports: [PrismaModule, JwtModule.register({}), VerificationModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard],
  exports: [AuthService, JwtAuthGuard, AdminGuard]
})
export class AuthModule {}