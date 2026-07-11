import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateFeedbackDto } from "./dto/feedback.dto";

function toFeedbackView(row: {
  id: string;
  category: string;
  message: string;
  attachmentUrl: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    category: row.category,
    message: row.message,
    attachmentUrl: row.attachmentUrl ?? undefined,
    status: row.status.toLowerCase(),
    createdAt: row.createdAt.toISOString()
  };
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async createFeedback(userId: string, dto: CreateFeedbackDto) {
    const feedback = await this.prisma.feedback.create({
      data: {
        userId,
        category: dto.category ?? "general",
        message: dto.message.trim(),
        attachmentUrl: dto.attachmentUrl?.trim() || undefined
      }
    });
    return toFeedbackView(feedback);
  }

  async listMyFeedback(userId: string) {
    const rows = await this.prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    return rows.map(toFeedbackView);
  }
}