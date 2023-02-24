export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR"
const logLevels = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"]

export interface WorkerLoggerOptions {
  /**
   * Default `INFO`
   */
  level?: LogLevel,
  /**
   * Only provides the log lines >= the current log level.
   * e.g. `TRACE` logs will be suppressed for level `DEBUG` and above.
   */
  destinationFunction?(lines: LogLine[]): Promise<void>
}

export interface LogMeta {
  [key: string]: any
  error?: Error
}

export interface LogLine {
  message: string
  meta?: LogMeta
  level: LogLevel
}

export default class WorkerLogger {
  opts: WorkerLoggerOptions
  logLines: LogLine[] = []

  constructor(options: WorkerLoggerOptions) {
    this.opts = options
  }

  writeLog(level: LogLevel, msg: string, meta?: LogMeta) {
    // Check log level - yes there is probably a better way to do this shut up
    if (logLevels.indexOf(level) < logLevels.indexOf(this.opts.level || "INFO")) {
      return
    }
  }

  trace(msg: string, meta?: LogMeta) {
    this.writeLog("TRACE", msg, meta)
  }

  debug(msg: string, meta?: LogMeta) {
    this.writeLog("DEBUG", msg, meta)
  }

  info(msg: string, meta?: LogMeta) {
    this.writeLog("INFO", msg, meta)
  }

  warn(msg: string, meta?: LogMeta) {
    this.writeLog("WARN", msg, meta)
  }

  error(msg: string, meta?: LogMeta) {
    this.writeLog("ERROR", msg, meta)
  }

  async Drain() {
    if (!this.opts.destinationFunction) {
      return
    }

    return this.opts.destinationFunction()
  }
}
