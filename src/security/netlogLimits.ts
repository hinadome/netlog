/** Hard cap before reading netlog JSON into memory (250 MiB). */
export const MAX_NETLOG_FILE_BYTES = 250 * 1024 * 1024

export function formatNetlogFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function validateNetlogFileSize(byteLength: number): string | null {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return 'Invalid file size.'
  }
  if (byteLength > MAX_NETLOG_FILE_BYTES) {
    return `File is too large (${formatNetlogFileSize(byteLength)}). Maximum is ${formatNetlogFileSize(MAX_NETLOG_FILE_BYTES)}. Split or trim the capture before loading.`
  }
  return null
}
