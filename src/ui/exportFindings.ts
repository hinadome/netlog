export function exportFindingsJson(findings: unknown[], fileName: string): void {
  const blob = new Blob([JSON.stringify(findings, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${baseName(fileName)}-findings.json`)
}

export function exportFindingsMarkdown(
  analysis: {
    fileName: string
    eventCount: number
    findings: Array<{
      severity: string
      title: string
      explanation: string
      suggestion: string
      host?: string
      url?: string
      protocol?: string
      sessionId?: number
      ruleId: string
    }>
    sessionSummaries: Array<{ protocol: string; host: string; hasError: boolean }>
  },
): void {
  const lines: string[] = [
    `# Netlog findings — ${analysis.fileName}`,
    '',
    `- Events: ${analysis.eventCount}`,
    `- Sessions: ${analysis.sessionSummaries.length}`,
    `- Findings: ${analysis.findings.length}`,
    '',
  ]

  for (const f of analysis.findings) {
    lines.push(`## [${f.severity}] ${f.title}`)
    lines.push('')
    if (f.host) lines.push(`- Host: \`${f.host}\``)
    if (f.url) lines.push(`- URL: \`${f.url}\``)
    if (f.sessionId !== undefined) {
      lines.push(`- Session: ${f.protocol ?? '?'} #${f.sessionId}`)
    }
    lines.push(`- Rule: \`${f.ruleId}\``)
    lines.push('')
    lines.push(f.explanation)
    lines.push('')
    lines.push(`**Suggestion:** ${f.suggestion}`)
    lines.push('')
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  downloadBlob(blob, `${baseName(analysis.fileName)}-findings.md`)
}

function baseName(name: string): string {
  return name.replace(/\.(json|netlog\.json)$/i, '') || 'netlog'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
