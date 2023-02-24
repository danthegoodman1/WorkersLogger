export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"
const logLevels = ["DEBUG", "INFO", "WARN", "ERROR"]

export interface WorkerLoggerOptions {
  /**
   * Default `INFO`
   */
  level?: LogLevel,
  /**
   * Disables logging to the console. Default `false`
   */
  disableConsole?: boolean
  /**
   * Time used to calculate the time of the log line. Omit if you don't want to collect logs at runtime. Function must create a serialized timestamp.
   */
  timestampFunc?(): string | number
  /**
   * Override for the timestamp key. Default `_time`. Only used if `timestampFunc` is provided.
   */
  timestampKey?: string
  /**
   * Will print to the console in JSON format. By default it pretty-prints like
   * ```
   * console.log(level, message, Array.from(Object.entries(meta)).reduce((agg, pair) => [...agg, ...pair]))
   * ```
   * Example result (in cloudflare log view):
   *
   * ["INFO", "this is a message", "key1", "val1", "key2", 42]
   */
  consoleJSON?: boolean
  /**
   * Only provides the log lines >= the current log level.
   * e.g. `TRACE` logs will be suppressed for level `DEBUG` and above.
   */
  destinationFunction?(lines: LogLine[]): Promise<void>
  /**
   * Optional object to join with each `log.meta`. Will be overwritten by an individual log's `.meta` properties.
   */
  withMeta?: { [key: string]: any }
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

  writeLog(level: LogLevel, message: string, meta?: LogMeta) {
    // Check log level - yes there is probably a better way to do this shut up
    if (logLevels.indexOf(level) < logLevels.indexOf(this.opts.level || "INFO")) {
      return
    }
    const line: LogLine = {
      level,
      message,
      meta: {
        ...this.opts.withMeta,
        ...meta
      }
    }
    if (this.opts.timestampFunc) {
      if (!line.meta) {
        line.meta = {}
      }
      line.meta[this.opts.timestampKey || "_time"] = this.opts.timestampFunc()
    }

    this.logLines.push(line)
    if (this.opts.disableConsole) {
      return
    }
    const logContent: any[] = [level, message]
    if (meta) {
      logContent.push(...Array.from(Object.entries(meta)).reduce((agg, pair) => [...agg, ...pair] as any))
    }
    switch (level) {
      case "DEBUG":
        console.debug(logContent)
        break
      case "INFO":
        console.info(logContent)
        break
      case "WARN":
        console.warn(logContent)
        break
      case "ERROR":
        console.error(logContent)
        break
    }
  }

  debug(message: string, meta?: LogMeta) {
    this.writeLog("DEBUG", message, meta)
  }

  info(message: string, meta?: LogMeta) {
    this.writeLog("INFO", message, meta)
  }

  warn(message: string, meta?: LogMeta) {
    this.writeLog("WARN", message, meta)
  }

  error(message: string, meta?: LogMeta) {
    this.writeLog("ERROR", message, meta)
  }

  async Drain() {
    if (!this.opts.destinationFunction) {
      return
    }

    return this.opts.destinationFunction(this.logLines)
  }
}
