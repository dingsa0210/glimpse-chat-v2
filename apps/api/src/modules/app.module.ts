import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { ContactsModule } from "./contacts/contacts.module";
import { HealthModule } from "./health/health.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { MailModule } from "./mail/mail.module";
import { MediaModule } from "./media/media.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    HealthModule,
    ContactsModule,
    ChatModule,
    MediaModule,
    FeedbackModule,
    AdminModule
  ]
})
export class AppModule {}