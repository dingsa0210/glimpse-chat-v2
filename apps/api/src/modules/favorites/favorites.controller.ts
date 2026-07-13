import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return { favorites: await this.favorites.listFavorites(user.id) };
  }

  @Post()
  async add(@CurrentUser() user: AuthenticatedUser, @Body() dto: { messageId?: string; tags?: string[] | string }) {
    return { favorite: await this.favorites.addFavorite(user.id, dto.messageId, dto.tags) };
  }

  @Delete(':messageId')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string) {
    await this.favorites.removeFavorite(user.id, messageId);
    return { ok: true };
  }
}

