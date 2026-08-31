import { describe, expect, it } from 'vitest'
import {
  classifyHttp2StreamId,
  classifyQuicStreamId,
  countStreamKinds,
  formatStreamField,
} from './streamKind'

describe('streamKind', () => {
  it('classifies HTTP/3 from id % 4', () => {
    expect(classifyQuicStreamId(0)).toMatchObject({
      initiator: 'local',
      direction: 'bidi',
      role: 'request',
      typeBits: 0,
    })
    expect(classifyQuicStreamId(3)).toMatchObject({
      initiator: 'peer',
      direction: 'uni',
      role: 'control',
    })
  })

  it('classifies HTTP/2 odd/even/zero', () => {
    expect(classifyHttp2StreamId(0)).toMatchObject({
      initiator: 'connection',
      role: 'control',
    })
    expect(classifyHttp2StreamId(1)).toMatchObject({
      initiator: 'local',
      role: 'request',
    })
    expect(classifyHttp2StreamId(9)).toMatchObject({
      initiator: 'local',
      role: 'request',
    })
    expect(classifyHttp2StreamId(2)).toMatchObject({
      initiator: 'peer',
      role: 'push',
    })
  })

  it('treats negative stream ids as connection/unset, not peer bidi', () => {
    expect(classifyQuicStreamId(-1)).toMatchObject({
      initiator: 'connection',
      role: 'control',
      shortLabel: 'connection',
    })
    expect(classifyHttp2StreamId(-1).shortLabel).toBe('no stream')
  })

  it('counts kinds per protocol and skips negative ids', () => {
    const h3 = countStreamKinds('h3', [0, 4, 2, 3, 1, -1])
    expect(h3.requests).toBe(2)
    expect(h3.localUni).toBe(1)
    expect(h3.peerUni).toBe(1)
    const h2 = countStreamKinds('h2', [1, 3, 5, 2])
    expect(h2.requests).toBe(3)
    expect(h2.peer).toBe(1)
    expect(formatStreamField(9, 'h2')).toContain('local request')
    expect(formatStreamField(4, 'h3')).toContain('local bidi')
  })
})
