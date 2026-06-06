import { useContext, useState } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Text from '../../../components/Text'
import Shadow from '../../../components/Shadow'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import InputContainer from '../../../components/InputContainer'
import Scanner from '../../../components/Scanner'
import Focusable from '../../../components/Focusable'
import TabSelector from './TabSelector'
import ScanIcon from '../../../icons/Scan'
import PasteIcon from '../../../icons/Paste'
import { pasteFromClipboard } from '../../../lib/clipboard'
import { addAddress, AddressType, getAddressTypeName, isValidAddress } from '../../../lib/addressBook'

interface AddressTypeOptionProps {
  type: AddressType
  selected: boolean
  onSelect: (type: AddressType) => void
}

function AddressTypeOption({ type, selected, onSelect }: AddressTypeOptionProps) {
  const style: React.CSSProperties = {
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    border: selected ? '2px solid var(--blue-primary)' : '1px solid var(--dark20)',
    backgroundColor: selected ? 'var(--blue-primary-10)' : 'transparent',
    transition: 'all 0.2s ease',
  }

  return (
    <Focusable onEnter={() => onSelect(type)}>
      <div style={style} onClick={() => onSelect(type)}>
        <Text bold={selected}>{getAddressTypeName(type)}</Text>
      </div>
    </Focusable>
  )
}

export default function AddressBookForm() {
  const { navigate, navigationData } = useContext(NavigationContext)

  // Check if we're adding to an existing contact
  const existingContactName = navigationData?.contactName as string | undefined
  const forceContact = navigationData?.isContact as boolean | undefined

  const [addressType, setAddressType] = useState<AddressType>(AddressType.Ark)
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [contactName, setContactName] = useState(existingContactName || '')
  const [isContact, setIsContact] = useState(forceContact ?? false)
  const [error, setError] = useState('')
  const [scan, setScan] = useState(false)

  const handleBack = () => {
    navigate(Pages.AppAddressBook)
  }

  const handleSubmit = () => {
    setError('')

    // Validate address
    if (!address.trim()) {
      setError('Please enter an address')
      return
    }

    if (!isValidAddress(address, addressType)) {
      setError(`Invalid ${getAddressTypeName(addressType).toLowerCase()}`)
      return
    }

    // Validate contact name if adding as contact
    if (isContact && !contactName.trim()) {
      setError('Please enter a contact name')
      return
    }

    // Add the address
    addAddress({
      type: addressType,
      address: address.trim(),
      label: label.trim() || undefined,
      contact: isContact ? contactName.trim() : null,
    })

    // Navigate back
    if (existingContactName) {
      navigate(Pages.AppAddressBookContact, { contactName: existingContactName })
    } else {
      navigate(Pages.AppAddressBook)
    }
  }

  return (
    <>
      <Header text={existingContactName ? 'Add Address' : 'New Address'} back={handleBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
              {/* Address type selector */}
              <FlexCol gap='0.5rem'>
                <Text bold small>
                  Address Type
                </Text>
                <FlexRow gap='0.5rem'>
                  {Object.values(AddressType).map((type) => (
                    <AddressTypeOption
                      key={type}
                      type={type}
                      selected={addressType === type}
                      onSelect={setAddressType}
                    />
                  ))}
                </FlexRow>
              </FlexCol>

              {/* My Account vs Contact toggle (only if not adding to existing contact) */}
              {existingContactName ? null : (
                <FlexCol gap='0.5rem'>
                  <Text bold small>
                    Save As
                  </Text>
                  <TabSelector
                    options={[
                      { value: 'account', label: 'My Account' },
                      { value: 'contact', label: 'Contact' },
                    ]}
                    selected={isContact ? 'contact' : 'account'}
                    onChange={(value) => setIsContact(value === 'contact')}
                  />
                </FlexCol>
              )}

              {/* Contact name input (shown when adding as contact) */}
              {isContact && !existingContactName ? (
                <InputContainer label='Contact Name'>
                  <input
                    className='input'
                    value={contactName}
                    placeholder='Enter contact name'
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </InputContainer>
              ) : null}

              {/* Show existing contact name if adding to contact */}
              {existingContactName ? (
                <FlexCol gap='0.25rem'>
                  <Text bold small>
                    Contact
                  </Text>
                  <Shadow>
                    <Text>{existingContactName}</Text>
                  </Shadow>
                </FlexCol>
              ) : null}

              {/* Label input (optional) */}
              <InputContainer label='Label (optional)'>
                <input
                  className='input'
                  value={label}
                  placeholder='e.g., Main wallet, Savings...'
                  onChange={(e) => setLabel(e.target.value)}
                />
              </InputContainer>

              {/* Address input */}
              <InputContainer
                label='Address'
                right={
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div
                      onClick={() => setScan(true)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      aria-label='Scan QR code'
                    >
                      <ScanIcon />
                    </div>
                    <div
                      onMouseDown={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        try {
                          const clipboardText = await navigator.clipboard.readText()
                          if (clipboardText) {
                            setAddress(clipboardText)
                          }
                        } catch (err) {
                          console.error('Failed to read clipboard:', err)
                        }
                      }}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      aria-label='Paste from clipboard'
                    >
                      <PasteIcon />
                    </div>
                  </div>
                }
              >
                <input
                  className='input'
                  value={address}
                  placeholder={`Enter ${getAddressTypeName(addressType).toLowerCase()}`}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </InputContainer>

              {/* Error message */}
              {error ? (
                <Text color='red' small>
                  {error}
                </Text>
              ) : null}
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button
            onClick={handleSubmit}
            label={isContact || existingContactName ? 'Add Contact Address' : 'Add Account'}
          />
        </ButtonsOnBottom>
      {scan ? (
        <Scanner close={() => setScan(false)} label='Scan address' onData={setAddress} onError={setError} />
      ) : null}
    </>
  )
}
