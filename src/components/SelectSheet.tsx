import { IonModal } from '@ionic/react'
import CloseIcon from '../icons/Close'
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
    <IonModal isOpen={isOpen} onDidDismiss={onClose} backdropDismiss showBackdrop className='sheet-modal-dark'>
      <div
        style={{
          borderTop: '1px solid var(--dark50)',
          borderTopLeftRadius: '1rem',
          borderTopRightRadius: '1rem',
          height: '100%',
          padding: '1rem',
          paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
          backgroundColor: '#101015',
        }}
      >
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
                  borderRadius: 'var(--info-container-radius)',
                  border: isSelected ? '2px solid var(--blue-primary)' : '1px solid var(--grey)',
                  backgroundColor: isSelected ? 'var(--white03)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'var(--white03)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                {option.icon ? <div style={{ flexShrink: 0 }}>{option.icon}</div> : null}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  >
                    {option.label}
                  </div>
                  {option.description ? (
                    <div
                      style={{
                        color: 'var(--grey)',
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
                      backgroundColor: 'var(--blue-primary)',
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
    </IonModal>
  )
}
