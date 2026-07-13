import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FavoritesController],
  providers: [FavoritesService]
})
export class FavoritesModule {}

