import ChevronDown from '../icons/ChevronDown'

interface SelectorFieldProps {
  icon?: React.ReactNode
  label: string
  onClick: () => void
  sublabel?: string
  value: string
}

export default function SelectorField({ icon, label, onClick, sublabel, value }: SelectorFieldProps) {
  return (
    <div style={{ width: '100%' }}>
      {label ? (
        <div
          style={{
            color: 'var(--white50)',
            fontSize: '12px',
            marginBottom: '6px',
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          borderRadius: 'var(--info-container-radius)',
          border: '1px solid var(--white10)',
          cursor: 'pointer',
          backgroundColor: 'var(--white05)',
          transition: 'all 0.15s ease',
          width: '100%',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--white07)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--white05)'
        }}
      >
        {icon ? <div style={{ flexShrink: 0 }}>{icon}</div> : null}
        <div style={{ flex: 1 }}>
          <div
            style={{
              color: 'white',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {value}
          </div>
          {sublabel ? (
            <div
              style={{
                color: 'var(--white50)',
                fontSize: '12px',
                marginTop: '2px',
              }}
            >
              {sublabel}
            </div>
          ) : null}
        </div>
        <div style={{ color: 'var(--white50)' }}>
          <ChevronDown />
        </div>
      </div>
    </div>
  )
}
