import Focusable from '../../../components/Focusable'

interface TabOption {
  value: string
  label: string
}

interface TabSelectorProps {
  options: TabOption[]
  selected: string
  onChange: (value: string) => void
}

export default function TabSelector({ options, selected, onChange }: TabSelectorProps) {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.25rem',
    padding: '0.25rem',
    backgroundColor: 'var(--dark10)',
    borderRadius: '0.5rem',
    width: '100%',
  }

  const focusableWrapperStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
  }

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '0.75rem',
    textAlign: 'center',
    cursor: 'pointer',
    borderRadius: '0.25rem',
    backgroundColor: active ? 'var(--blue-primary)' : 'var(--dark80)',
    color: active ? 'var(--white)' : 'var(--white)',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.2s ease',
  })

  return (
    <div style={containerStyle}>
      {options.map((option) => (
        <div key={option.value} style={focusableWrapperStyle}>
          <Focusable onEnter={() => onChange(option.value)}>
            <div style={buttonStyle(selected === option.value)} onClick={() => onChange(option.value)}>
              {option.label}
            </div>
          </Focusable>
        </div>
      ))}
    </div>
  )
}
