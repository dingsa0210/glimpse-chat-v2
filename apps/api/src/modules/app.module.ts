import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { ContactsModule } from './contacts/contacts.module';
import { HealthModule } from './health/health.module';
import { FeedbackModule } from './feedback/feedback.module';
import { FavoritesModule } from './favorites/favorites.module';
import { MediaModule } from './media/media.module';
import { PrismaModule } from './prisma/prisma.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { VoiceModule } from './voice/voice.module';
import { OcrModule } from './ocr/ocr.module';
import { AssistantModule } from './assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // The API is sometimes started from the workspace root and sometimes
      // from apps/api. Always load the API-local environment file first so
      // SMTP, database, and public URL settings are not silently skipped.
      envFilePath: [resolve(__dirname, '../../.env'), resolve(process.cwd(), '.env')]
    }),
    PrismaModule,
    SystemConfigModule,
    AuthModule,
    HealthModule,
    ContactsModule,
    ChatModule,
    MediaModule,
    FeedbackModule,
    FavoritesModule,
    AdminModule,
    VoiceModule,
    OcrModule,
    AssistantModule
  ]
})
export class AppModule {}

