import QrCode from './QrCode'
import CopyAddress from './CopyAddress'
import FlexCol from './FlexCol'
import { prettyLongText } from '../lib/format'

interface ReceiveAddressProps {
  value: string
  /** Shorten the printed value, for payloads too long to read (a Lightning
   * invoice). Addresses print in full so they can be checked by eye. */
  abbreviate?: boolean
}

/**
 * The QR code, printed address and copy button every receive screen shows.
 *
 * Shared so the Bitcoin/Arkade/Lightning receive and the bridge deposit
 * address (e.g. USDT on Ethereum) look and behave the same; the bridge screen
 * used to print its address with no copy button, which users missed.
 */
export default function ReceiveAddress({ value, abbreviate }: ReceiveAddressProps) {
  if (!value) return null
  return (
    <FlexCol centered gap='0.75rem'>
      <QrCode value={value} />
      <div
        data-testid='receive-address'
        style={{
          color: 'var(--neutral-500)',
          fontSize: '13px',
          maxWidth: '340px',
          textAlign: 'center',
          wordBreak: 'break-all',
        }}
      >
        {abbreviate ? prettyLongText(value, 20) : value}
      </div>
      <CopyAddress value={value} />
    </FlexCol>
  )
}
