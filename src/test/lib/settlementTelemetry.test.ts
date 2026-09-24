import { describe, expect, it } from 'vitest'
import { createSettlementTelemetry } from '../../lib/asp'

describe('settlement telemetry', () => {
  it('contains only generic diagnostic metadata', () => {
    const telemetry = createSettlementTelemetry('collaborativeExit', 'correlation-id')

    expect(telemetry).toEqual({
      tags: { operation: 'collaborativeExit', sdkVersion: expect.any(String) },
      contexts: { settlement: { category: 'settlement_failure', correlationId: 'correlation-id' } },
    })
    expect(JSON.stringify(telemetry)).not.toMatch(/address|amount|input|output|vtxo|txid/i)
  })
})
