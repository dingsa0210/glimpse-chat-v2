import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SystemConfigModule } from "../system-config/system-config.module";
import { MediaModule } from "../media/media.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({ imports: [AuthModule, SystemConfigModule, MediaModule], controllers: [AssistantController], providers: [AssistantService] })
export class AssistantModule {}
