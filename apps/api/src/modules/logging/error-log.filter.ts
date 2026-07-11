import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

type HttpRequest = {
  method?: string;
  url?: string;
};

type HttpResponse = {
  status(code: number): { json(body: unknown): void };
};

function messageFromException(exception: unknown) {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === "string") return response;
    if (response && typeof response === "object" && "message" in response) {
      const message = (response as { message?: unknown }).message;
      return Array.isArray(message) ? message.join("; ") : String(message ?? exception.message);
    }
    return exception.message;
  }
  return exception instanceof Error ? exception.message : "Unexpected server error.";
}

function responseBodyFromException(exception: unknown, status: number, message: string) {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (response && typeof response === "object") return response;
  }
  return {
    statusCode: status,
    message
  };
}

function stackFromException(exception: unknown) {
  return exception instanceof Error ? exception.stack : undefined;
}

@Catch()
export class ErrorLogFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorLogFilter.name);
  private readonly logFile: string;

  constructor(logDir = join(process.cwd(), "99_输出结果", "glimpse-api-logs")) {
    const resolvedLogDir = resolve(logDir);
    mkdirSync(resolvedLogDir, { recursive: true });
    this.logFile = join(resolvedLogDir, "errors.log");
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequest>();
    const response = context.getResponse<HttpResponse>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = messageFromException(exception);

    if (status >= 500) {
      this.writeError({
        timestamp: new Date().toISOString(),
        method: request.method ?? "UNKNOWN",
        url: request.url ?? "UNKNOWN",
        status,
        name: exception instanceof Error ? exception.name : "UnknownError",
        message,
        stack: stackFromException(exception)
      });
    }

    response.status(status).json(responseBodyFromException(exception, status, message));
  }

  private writeError(entry: Record<string, unknown>) {
    try {
      appendFileSync(this.logFile, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (error) {
      this.logger.error("Failed to write API error log", error instanceof Error ? error.stack : String(error));
    }
  }
}