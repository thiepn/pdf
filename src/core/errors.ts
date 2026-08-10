export type AppErrorSeverity = "info" | "warning" | "error" | "fatal";

export interface AppErrorContext {
  area: string;
  operation?: string;
  route?: string;
  projectId?: string;
  severity?: AppErrorSeverity;
  recoverable?: boolean;
  details?: Record<string, string | number | boolean | null | undefined>;
}

export interface SerializedAppError {
  name: string;
  message: string;
  stack?: string;
  context: AppErrorContext;
  timestamp: number;
}

export class AppError extends Error {
  readonly context: AppErrorContext;

  constructor(message: string, context: AppErrorContext, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.context = context;
  }
}

export function serializeError(reason: unknown, context: AppErrorContext): SerializedAppError {
  if (reason instanceof AppError) {
    return {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
      context: { ...context, ...reason.context },
      timestamp: Date.now()
    };
  }
  if (reason instanceof Error) {
    return { name: reason.name, message: reason.message, stack: reason.stack, context, timestamp: Date.now() };
  }
  return { name: "UnknownError", message: typeof reason === "string" ? reason : String(reason), context, timestamp: Date.now() };
}

export function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
