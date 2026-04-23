import { IonModal } from '@ionic/react'
import CloseIcon from '../icons/Close'

interface SheetModalProps {
  children?: React.ReactNode
  isOpen: boolean
  onClose: () => void
}

export default function SheetModal({ children, isOpen, onClose }: SheetModalProps) {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} backdropDismiss showBackdrop className='sheet-modal-dark'>
      <div
        style={{
          backgroundColor: '#101015',
          borderTop: '1px solid var(--dark50)',
          borderTopLeftRadius: '1rem',
          borderTopRightRadius: '1rem',
          height: '100%',
          padding: '1rem',
          paddingBottom: 'calc(3rem + env(safe-area-inset-bottom))',
        }}
      >
        <div
          style={{ cursor: 'pointer', position: 'absolute', right: '1rem', top: '1rem', zIndex: 10 }}
          onClick={onClose}
        >
          <CloseIcon />
        </div>
        {children}
      </div>
    </IonModal>
  )
}
