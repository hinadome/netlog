export function jqForEventIndex(index: number): string {
  return `jq '.events[${index}]' chrome-net-export-log.json`
}

export function jqForSessionEvents(sessionId: number, eventIndex: number): string {
  return `jq '
  .events
  | to_entries[]
  | select(.value.source.id == ${sessionId})
  | select(.key >= ${Math.max(0, eventIndex - 5)} and .key <= ${eventIndex + 5})
  | {index: .key, event: .value}
' chrome-net-export-log.json`
}
