/** Re-exports — prefer importing from `./streamKind`. */
export {
  classifyHttp2StreamId,
  classifyQuicStreamId,
  classifyStreamId,
  countStreamKinds,
  formatStreamField,
  type ProtocolKind,
  type QuicStreamType,
  type StreamDirection,
  type StreamInitiator,
  type StreamKindCounts,
  type StreamKindInfo,
  type StreamRole,
} from './streamKind'
