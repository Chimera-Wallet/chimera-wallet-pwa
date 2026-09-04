import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import CopyIcon from '../icons/Copy'
import CheckMarkIcon from '../icons/CheckMark'
import { copyToClipboard } from '../lib/clipboard'
import { useToast } from './Toast'
import { hapticSubtle } from '../lib/haptics'
import { useTranslation } from 'react-i18next'

interface CopyAddressProps {
  value: string
}

/**
 * Copy button for the single address a receive screen is showing.
 *
 * Replaces the old expand/collapse address list: that came from Arkade's
 * design, where one screen offered several address types at once. Here the
 * network selector already picked the address, so there is exactly one thing
 * to copy and nothing to expand — a plain button with a copy icon suffix.
 */
export default function CopyAddress({ value }: CopyAddressProps) {
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout>>()

  const { toast } = useToast()
  const { t } = useTranslation()

  // A new address is a new thing to copy, so drop the confirmation state
  useEffect(() => {
    setCopied(false)
  }, [value])

  useEffect(() => () => clearTimeout(timeout.current), [])

  const handleCopy = async () => {
    if (!value) return
    hapticSubtle()
    await copyToClipboard(value)
    toast(t('common.general.copyClipboard'))
    setCopied(true)
    clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ margin: '0 auto', maxWidth: '100%', width: '300px' }}>
      <Button
        testId='copy-address'
        secondary
        disabled={!value}
        label={t('common.general.copyAddress')}
        icon={copied ? <CheckMarkIcon /> : <CopyIcon />}
        onClick={handleCopy}
        style={{
          margin: '4px 0',
          fontFamily: 'Titillium Web',
          fontStyle: 'semibold',
          fontWeight: 600,
          width: '100%',
          height: '48px',
          borderRadius: '16px',
        }}
      />
    </div>
  )
}
