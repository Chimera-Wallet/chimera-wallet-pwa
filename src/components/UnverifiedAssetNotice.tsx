import { useTranslation } from 'react-i18next'
import FlexCol from './FlexCol'
import Text from './Text'
import UnverifiedBadge from './UnverifiedBadge'
import { truncatedAssetId } from '../lib/assets'

interface UnverifiedAssetNoticeProps {
  assetId: string
  /** Overrides the default explanation, e.g. for a custom solver. */
  text?: string
}

/**
 * Inline, non-blocking explanation shown wherever an unverified asset is about
 * to be sent, received or inspected. Shows the asset id because it — not the
 * name or ticker, which anyone can copy — is what identifies the token.
 */
export default function UnverifiedAssetNotice({ assetId, text }: UnverifiedAssetNoticeProps) {
  const { t } = useTranslation()
  return (
    <div
      data-testid='unverified-asset-notice'
      style={{
        backgroundColor: 'color-mix(in srgb, var(--orange-500) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--orange-500) 35%, transparent)',
        borderRadius: '0.5rem',
        padding: '0.75rem',
        width: '100%',
      }}
    >
      <FlexCol gap='0.5rem'>
        <UnverifiedBadge />
        <Text small wrap>
          {text ?? t('components.assetTrust.notice')}
        </Text>
        {assetId ? (
          <Text smaller color='neutral-500' copy={assetId}>
            {t('components.assetTrust.assetId')}: {truncatedAssetId(assetId) || assetId}
          </Text>
        ) : null}
      </FlexCol>
    </div>
  )
}
