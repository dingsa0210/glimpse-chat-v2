import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "./auth.types";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.role === "admin") return true;
    throw new ForbiddenException("Admin access is required.");
  }
}