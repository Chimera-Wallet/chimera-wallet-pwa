import CloseIcon from '../icons/Close'
import SheetModal from './SheetModal'
import Text from './Text'

interface SelectSheetOption {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
}

interface SelectSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (id: string) => void
  options: SelectSheetOption[]
  selected?: string
  title: string
}

export default function SelectSheet({ isOpen, onClose, onSelect, options, selected, title }: SelectSheetProps) {
  const handleSelect = (id: string) => {
    onSelect(id)
    onClose()
  }

  return (
    <SheetModal isOpen={isOpen} onClose={onClose}>
      <div style={{ paddingTop: '0.5rem' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <Text heading>{title}</Text>
          <div style={{ cursor: 'pointer', padding: '0.5rem' }} onClick={onClose}>
            <CloseIcon />
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {options.map((option) => {
            const isSelected = option.id === selected
            return (
              <div
                key={option.id}
                onClick={() => handleSelect(option.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: 'var(--info-container-radius, 12px)',
                  border: isSelected ? '2px solid var(--purple-700)' : '1px solid var(--neutral-200)',
                  backgroundColor: isSelected ? 'var(--neutral-50)' : 'var(--info-container-bg2)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'var(--info-container-bg2)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'var(--info-container-bg2)'
                  }
                }}
              >
                {option.icon ? <div style={{ flexShrink: 0 }}>{option.icon}</div> : null}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: 'var(--fg)',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  >
                    {option.label}
                  </div>
                  {option.description ? (
                    <div
                      style={{
                        color: 'var(--neutral-500)',
                        fontSize: '12px',
                        marginTop: '2px',
                      }}
                    >
                      {option.description}
                    </div>
                  ) : null}
                </div>
                {isSelected ? (
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--purple-700)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width='12' height='12' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                      <path
                        d='M20 6L9 17L4 12'
                        stroke='white'
                        strokeWidth='3'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                      />
                    </svg>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </SheetModal>
  )
}
