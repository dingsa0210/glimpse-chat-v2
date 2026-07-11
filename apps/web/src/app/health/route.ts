import { GLIMPSE_CHAT_VERSION } from "@glimpse/shared";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "glimpse-web",
    version: GLIMPSE_CHAT_VERSION,
    status: "live",
    timestamp: new Date().toISOString()
  });
}