import { describe, expect, it } from 'vitest'
import {
  emptyBankDetailsFields,
  maskBankAccount,
  toBankData,
  toBankDetailsFields,
  type BankData,
} from '../../lib/bankTransferConfig'

const swift: BankData = {
  circuit: 'swift',
  destinationBankAddress: 'CH9300762011623852957',
  bic: 'UBSWCHZH80A',
  accountHolderName: 'Jane Doe',
  country: 'CH',
  streetName: 'Bahnhofstrasse',
  buildingNumber: '1',
  townName: 'Zurich',
  postCode: '8001',
}

describe('bank details fields', () => {
  it('builds BankData only when every field the circuit needs is filled', () => {
    const fields = { ...emptyBankDetailsFields, iban: 'DE89', accountHolderName: 'Jane' }
    expect(toBankData('sepa', fields)).toEqual({ circuit: 'sepa', destinationBankAddress: 'DE89', accountHolderName: 'Jane' })
    // SWIFT also needs the BIC and the structured beneficiary address
    expect(toBankData('swift', fields)).toBeNull()
    expect(toBankData('us', fields)).toBeNull()
  })

  it('round-trips saved details through the form fields', () => {
    expect(toBankData('swift', toBankDetailsFields(swift))).toEqual(swift)
    const us: BankData = { circuit: 'us', accountNumber: '123456789', routingNumber: '021000021', accountHolderName: 'Jane' }
    expect(toBankData('us', toBankDetailsFields(us))).toEqual(us)
    expect(toBankDetailsFields(undefined)).toEqual(emptyBankDetailsFields)
  })

  it('masks the account number for display', () => {
    expect(maskBankAccount(swift)).toBe('CH93 •••• 2957')
    expect(maskBankAccount(undefined)).toBe('')
  })
})
