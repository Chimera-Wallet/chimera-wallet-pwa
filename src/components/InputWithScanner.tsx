import InputContainer from './InputContainer'
import ScanIcon from '../icons/Scan'
import AddressBookIcon from '../icons/AddressBook'
import Clipboard from './Clipboard'
import FlexCol from './FlexCol'
import { useRef, useEffect, ChangeEventHandler } from 'react'
import { hapticLight } from '../lib/haptics'
import Paste from './Paste'
import { ClearButtonOnInput, ScanButtonOnInput, AddressButtonOnInput } from './Button'
import FlexRow from './FlexRow'

interface InputWithScannerProps {
  error?: string
  focus?: boolean
  label?: string
  name?: string
  onChange: (arg0: any) => void
  onEnter?: () => void
  openAddressBook?: () => void
  openScan: () => void
  placeholder?: string
  validator?: (arg0: string) => boolean
  value?: string
}

export default function InputWithScanner({
  error,
  focus,
  label,
  name,
  onChange,
  onEnter,
  openAddressBook,
  openScan,
  placeholder,
  validator,
  value,
}: InputWithScannerProps) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focus && input.current) input.current.focus()
  }, [focus, input.current])

  const handleChange: ChangeEventHandler<HTMLInputElement> = (ev) => {
    onChange(ev.currentTarget.value)
  }

  const handlePaste = (data: string) => {
    onChange(data)
  }

  const handleClear = () => {
    hapticLight()
    onChange('')
  }

  const handleScan = () => {
    hapticLight()
    openScan()
  }

  const handleAddressBook = () => {
    hapticLight()
    openAddressBook?.()
  }

  const hasValue = Boolean(value && value.length > 0)



  return (
    <InputContainer label={label} error={error}>
      <label className='label has-buttons'>
        <input
          ref={input}
          name={name}
          value={value}
          className='input'
          onChange={handleChange}
          placeholder={placeholder}
          onKeyUp={(ev) => ev.key === 'Enter' && onEnter && onEnter()}
        />
        <div>
          {hasValue ? (
            <ClearButtonOnInput onClick={handleClear} />
          ) : (
            <FlexRow gap='0.25rem'>
               {openAddressBook ? (
                  <AddressButtonOnInput onClick={handleAddressBook} />
                ) : null}
              <Paste validator={validator} onPaste={handlePaste} />
              <ScanButtonOnInput onClick={handleScan} />
            </FlexRow>
          )}
        </div>
      </label>
    </InputContainer>
  )
}
