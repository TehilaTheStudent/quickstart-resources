import fs from "fs";
import path from "path";

const LOG_FILE_PATH = "app.log";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function formatDate(date: Date): string {
  return date.toISOString();
}

function writeLog(level: LogLevel, message: string) {
  const timestamp = formatDate(new Date());
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  fs.appendFileSync(LOG_FILE_PATH, logMessage, { encoding: "utf8" });
}

export const logger = {
  info: (msg: string) => writeLog("INFO", msg),
  warn: (msg: string) => writeLog("WARN", msg),
  error: (msg: string) => writeLog("ERROR", msg),
  debug: (msg: string) => writeLog("DEBUG", msg),
};

/**
 * Pretty print a JSON object with a header, wrapped in ==== lines for readability.
 * @param header - The header to print before the JSON (e.g., 'response', 'tools')
 * @param obj - The object to pretty print
 */
/**
 * Pretty print a JSON object with a header, wrapped in ==== lines for readability, and write to the log file.
 * @param level - LogLevel (INFO, WARN, ERROR, DEBUG)
 * @param header - The header to print before the JSON (e.g., 'response', 'tools')
 * @param obj - The object to pretty print
 */
export function logPrettyJson(level: LogLevel, header: string, obj: any) {
  const message = `\n==== ${header} ====\n${JSON.stringify(obj, null, 2)}\n==== end ${header} ====`;
  writeLog(level, message);
}

/**
 * Log tool usage with emoji and tool name only.
 * @param toolName - The name of the tool being used
 */
export function logToolUse(toolName: string) {
  writeLog("INFO", `🛠️ Tool used: ${toolName}`);
}
