import { useTranslation } from 'react-i18next'

interface UnverifiedBadgeProps {
  /** Overrides the default "Unverified" text, e.g. "Custom" for a user-added solver. */
  label?: string
}

/**
 * Warning pill for an asset outside the verified set (or a solver Chimera does
 * not vouch for). Informational only — it never gates what the user can do.
 */
export default function UnverifiedBadge({ label }: UnverifiedBadgeProps) {
  const { t } = useTranslation()
  const text = label ?? t('components.assetTrust.unverified')
  return (
    <span
      title={t('components.assetTrust.notice')}
      data-testid='unverified-badge'
      style={{
        backgroundColor: 'color-mix(in srgb, var(--orange-500) 22%, transparent)',
        color: 'var(--orange-400)',
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        padding: '2px 5px',
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        width: 'fit-content',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      {text}
    </span>
  )
}
