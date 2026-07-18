import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./modules/app.module";
import { ErrorLogFilter } from "./modules/logging/error-log.filter";

type HttpRequest = {
  path: string;
  ip?: string;
  socket: { remoteAddress?: string };
};

type HttpResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
};

type NextFunction = () => void;
type BodyParserFactory = (options: { limit: string; extended?: boolean }) => unknown;
const expressRuntime = require("express") as {
  json: BodyParserFactory;
  urlencoded: BodyParserFactory;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

function parseOrigins(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function createRateLimitMiddleware(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, RateLimitState>();
  let requestCount = 0;
  return (request: HttpRequest, response: HttpResponse, next: NextFunction) => {
    if (request.path === "/health" || request.path.startsWith("/health/")) return next();
    const now = Date.now();
    requestCount += 1;
    if (requestCount % 1000 === 0) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    const key = `${request.ip ?? request.socket.remoteAddress ?? "unknown"}:${request.path}`;
    const current = buckets.get(key);
    const state = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    state.count += 1;
    buckets.set(key, state);
    response.setHeader("X-RateLimit-Limit", String(maxRequests));
    response.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - state.count)));
    response.setHeader("X-RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));
    if (state.count > maxRequests) {
      response.status(429).json({ statusCode: 429, message: "Too many requests. Try again later." });
      return;
    }
    next();
  };
}

async function bootstrap() {
  const bootstrapConfig = new ConfigService();
  const isProduction = bootstrapConfig.get<string>("NODE_ENV") === "production";
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: isProduction ? ["error", "warn"] : ["log", "error", "warn", "debug", "verbose"]
  });
  const config = app.get(ConfigService);
  const uploadBodyLimit = config.get<string>("MEDIA_UPLOAD_BODY_LIMIT", "750mb");
  app.use(expressRuntime.json({ limit: uploadBodyLimit }));
  app.use(expressRuntime.urlencoded({ extended: true, limit: uploadBodyLimit }));
  const webOrigin = config.get<string>("WEB_ORIGIN", "*");
  const origins = parseOrigins(webOrigin);

  if (isProduction && (webOrigin === "*" || origins.length === 0)) {
    throw new Error("WEB_ORIGIN must be an explicit origin list in production.");
  }

  app.enableCors({
    origin: webOrigin === "*" ? true : origins,
    credentials: true
  });

  const configuredRateLimitMax = Number(config.get<string>("API_RATE_LIMIT_MAX", "120"));
  const configuredRateLimitWindowMs = Number(config.get<string>("API_RATE_LIMIT_WINDOW_MS", "60000"));
  app.use(createRateLimitMiddleware(
    Number.isFinite(configuredRateLimitMax) && configuredRateLimitMax > 0 ? Math.floor(configuredRateLimitMax) : 120,
    Number.isFinite(configuredRateLimitWindowMs) && configuredRateLimitWindowMs > 0 ? Math.floor(configuredRateLimitWindowMs) : 60_000
  ));

  app.useGlobalFilters(new ErrorLogFilter(config.get<string>("API_ERROR_LOG_DIR")));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const swaggerEnabled = config.get<string>("ENABLE_SWAGGER", isProduction ? "false" : "true") === "true";
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Glimpse Chat API")
      .setDescription("REST API for Glimpse Chat.")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(config.get<number>("PORT", 4100), "0.0.0.0");
}

void bootstrap();




