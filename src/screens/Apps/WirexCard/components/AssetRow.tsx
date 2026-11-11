import { ReactNode } from 'react'
import FlexRow from '../../../../components/FlexRow'
import FlexCol from '../../../../components/FlexCol'
import Text from '../../../../components/Text'
import ChevronDown from '../../../../icons/ChevronDown'

// Adapted from the file-private SwapAssetRow/FlipAssetsButton in
// ../../Swap/AssetSwapForm.tsx (copied rather than exported to keep the Wirex
// screens isolated from the swap screen).

interface AssetRowProps {
  icon?: ReactNode
  name: string
  onClick?: () => void
  sublabel?: string
  amount: ReactNode
  testId?: string
}

export function AssetRow({ icon, name, onClick, sublabel, amount, testId }: AssetRowProps) {
  return (
    <FlexRow between testId={testId}>
      <FlexRow gap='0.6rem'>
        {icon}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <div onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
            <FlexRow gap='0.25rem'>
              <Text bold>{name}</Text>
              {onClick ? <ChevronDown /> : null}
            </FlexRow>
          </div>
          {sublabel ? (
            <Text smaller color='neutral-500' wrap>
              {sublabel}
            </Text>
          ) : null}
        </div>
      </FlexRow>
      <FlexCol gap='0' end>
        {amount}
      </FlexCol>
    </FlexRow>
  )
}

export function FlipButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label='Flip direction'
      data-testid='wirex-flip'
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--blue-primary)',
        border: '3px solid var(--surface, var(--dark10))',
        borderRadius: '50%',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'var(--white)',
      }}
    >
      {children}
    </button>
  )
}
