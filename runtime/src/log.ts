export type LogLevel = "debug" | "info" | "warning" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

let threshold = LEVEL_ORDER[(process.env.FUSE_LOG_LEVEL as LogLevel) ?? "info"] ?? 20;

export function setLevel(level: LogLevel): void {
  threshold = LEVEL_ORDER[level];
}

function write(level: LogLevel, source: string, msg: string): void {
  if (LEVEL_ORDER[level] < threshold) return;
  const ts = new Date().toISOString();
  const src = source ? ` | ${source}` : "";
  process.stderr.write(`${ts} | ${level.toUpperCase()}${src} | ${msg}\n`);
}

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warning(msg: string): void;
  error(msg: string): void;
  exception(msg: string, err?: unknown): void;
  bind(source: string): Logger;
}

function makeLogger(source: string): Logger {
  return {
    debug: (m) => write("debug", source, m),
    info: (m) => write("info", source, m),
    warning: (m) => write("warning", source, m),
    error: (m) => write("error", source, m),
    exception: (m, err) => {
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : err != null ? String(err) : "";
      write("error", source, detail ? `${m}\n${detail}` : m);
    },
    bind: (s) => makeLogger(s),
  };
}

export const logger: Logger = makeLogger("");
