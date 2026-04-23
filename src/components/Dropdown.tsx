import { useState } from 'react'
import ChevronDownIcon from '../icons/ChevronDown'
import FlexRow from './FlexRow'
import InputContainer from './InputContainer'
import Select from './Select'
import SheetModal from './SheetModal'
import Text from './Text'

interface DropdownProps {
  label?: string
  labels?: string[]
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  selected: string
}

export default function Dropdown({ label, labels, onChange, options, placeholder, selected }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedIndex = options.indexOf(selected)
  const displayValue = selectedIndex >= 0 ? (labels?.[selectedIndex] ?? selected) : (placeholder ?? 'Select')

  return (
    <>
      <InputContainer label={label}>
        <div onClick={() => setIsOpen(true)} style={{ width: '100%', cursor: 'pointer' }}>
          <FlexRow between>
            <Text color={selectedIndex >= 0 ? undefined : 'dark50'}>{displayValue}</Text>
            <ChevronDownIcon />
          </FlexRow>
        </div>
      </InputContainer>
      <SheetModal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <Text bold large>
          {label ?? 'Select'}
        </Text>
        <div style={{ marginTop: '1rem' }}>
          <Select
            labels={labels}
            onChange={(value) => {
              onChange(value)
              setIsOpen(false)
            }}
            options={options}
            selected={selected}
          />
        </div>
      </SheetModal>
    </>
  )
}
