import { useContext, useState, useEffect, useMemo } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Text from '../../../components/Text'
import Shadow from '../../../components/Shadow'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Focusable from '../../../components/Focusable'
import AddIcon from '../../../icons/Add'
import TabSelector from './TabSelector'
import {
  getAddressBook,
  getMyAccounts,
  getContacts,
  removeAddress,
  removeContact,
  getAddressTypeName,
  AddressBookEntry,
  AddressType,
} from '../../../lib/addressBook'
import TrashIcon from '../../../icons/X'
import {useTranslation} from 'react-i18next'

type TabType = 'myaccounts' | 'contacts'

interface AddressEntryProps {
  entry: AddressBookEntry
  onDelete: (id: string) => void
  onSelect?: (address: string) => void
  selectionMode?: boolean
}

function AddressEntry({ entry, onDelete, onSelect, selectionMode }: AddressEntryProps) {
  const truncateAddress = (addr: string) => {
    if (addr.length <= 20) return addr
    return `${addr.slice(0, 10)}...${addr.slice(-10)}`
  }

  const {t} = useTranslation()

  return (
    <Shadow>
      <FlexRow between>
        <Focusable onEnter={() => (selectionMode && onSelect ? onSelect(entry.address) : undefined)}>
          <div
            onClick={() => (selectionMode && onSelect ? onSelect(entry.address) : undefined)}
            style={{
              cursor: selectionMode ? 'pointer' : 'default',
              flex: 1,
              padding: '0.5rem 0',
            }}
          >
            <FlexCol gap='0.25rem'>
              <Text bold small>
                {entry.label || getAddressTypeName(entry.type)}
              </Text>
              <Text tiny>{truncateAddress(entry.address)}</Text>
            </FlexCol>
          </div>
        </Focusable>
        {!selectionMode && (
          <Focusable onEnter={() => onDelete(entry.id)} fit round>
            <div
              onClick={() => onDelete(entry.id)}
              style={{ cursor: 'pointer', padding: '0.5rem' }}
              aria-label={t('apps.addressBook.delAdd')}
            >
              <TrashIcon />
            </div>
          </Focusable>
        )}
      </FlexRow>
    </Shadow>
  )
}

interface ContactEntryProps {
  name: string
  addressCount: number
  onClick: () => void
  onDelete: () => void
}

function ContactEntry({ name, addressCount, onClick, onDelete }: ContactEntryProps) {
  const {t} = useTranslation()
  return (
    <Shadow>
      <FlexRow between>
        <Focusable onEnter={onClick}>
          <div onClick={onClick} style={{ cursor: 'pointer', flex: 1 }}>
            <FlexCol gap='0.25rem'>
              <Text bold>{name}</Text>
              <Text tiny>
                {addressCount} {addressCount === 1 ? t('apps.addressBook.lowAddress') : t('apps.addressBook.lowAddresses')}
              </Text>
            </FlexCol>
          </div>
        </Focusable>
        <Focusable onEnter={onDelete} fit round>
          <div
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            style={{ cursor: 'pointer', padding: '0.5rem' }}
            aria-label={t('apps.addressBook.delCont')}
          >
            <TrashIcon />
          </div>
        </Focusable>
      </FlexRow>
    </Shadow>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <FlexCol centered gap='1rem'>
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <Text wrap>{message}</Text>
      </div>
    </FlexCol>
  )
}

export default function AppAddressBook() {
  const { navigate, navigationData, goBack, popTo } = useContext(NavigationContext)
  const { sendInfo, setSendInfo } = useContext(FlowContext)
  const [currentTab, setCurrentTab] = useState<TabType>('myaccounts')
  const [refreshKey, setRefreshKey] = useState(0)

  const {t} = useTranslation()

  const selectionMode = navigationData?.selectionMode === true
  const returnTo = navigationData?.returnTo as Pages | undefined

  const myAccounts = useMemo(() => getMyAccounts(), [refreshKey])
  const contacts = useMemo(() => getContacts(), [refreshKey])
  const addressBook = useMemo(() => getAddressBook(), [refreshKey])

  const handleSelectAddress = (address: string) => {
    // Update sendInfo with the selected address
    setSendInfo({ ...sendInfo, address, recipient: address })

    // Navigate directly back to the originating screen if returnTo is set
    if (returnTo !== undefined) {
      popTo(returnTo)
    } else {
      goBack()
    }
  }

  const handleBack = () => {
    if (selectionMode) {
      // Use goBack to avoid duplicate entries in navigation stack
      goBack()
    } else {
      navigate(Pages.Apps)
    }
  }

  const handleAddNew = () => {
    navigate(Pages.AppAddressBookForm)
  }

  const handleDeleteAddress = (id: string) => {
    if (confirm(t('apps.addressBook.delAddConf'))) {
      removeAddress(id)
      setRefreshKey((k) => k + 1)
    }
  }

  const handleDeleteContact = (name: string) => {
    if (confirm(t('apps.addressBook.delContact', {name: name}))) {
      removeContact(name)
      setRefreshKey((k) => k + 1)
    }
  }

  const handleViewContact = (name: string) => {
    navigate(Pages.AppAddressBookContact, {
      contactName: name,
      selectionMode,
      returnTo,
    })
  }

  const getContactAddressCount = (name: string): number => {
    return addressBook.filter((e) => e.contact === name).length
  }

  return (
    <>
      <Header
        text={selectionMode ? t('apps.addressBook.selAddr') : t('apps.addressBook.addressBook')}
        back={handleBack}
        auxFunc={selectionMode ? undefined : handleAddNew}
        auxIcon={selectionMode ? undefined : <AddIcon />}
        auxAriaLabel={selectionMode ? undefined : t('apps.addressBook.addNewAddr')}
      />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            {/* Tab selector */}
            <TabSelector
              options={[
                { value: 'myaccounts', label: t('apps.addressBook.myAcc') },
                { value: 'contacts', label: t('apps.addressBook.contact') },
              ]}
              selected={currentTab}
              onChange={(value) => setCurrentTab(value as TabType)}
            />

            {/* Content based on selected tab */}
            {currentTab === 'myaccounts' && (
              <FlexCol gap='0.5rem'>
                {myAccounts.length === 0 ? (
                  <EmptyState message={t('apps.addressBook.emptyMess')} />
                ) : (
                  myAccounts.map((entry) => (
                    <AddressEntry
                      key={entry.id}
                      entry={entry}
                      onDelete={handleDeleteAddress}
                      onSelect={handleSelectAddress}
                      selectionMode={selectionMode}
                    />
                  ))
                )}
              </FlexCol>
            )}

            {currentTab === 'contacts' && (
              <FlexCol gap='0.5rem'>
                {contacts.length === 0 ? (
                  <EmptyState message={t('apps.addressBook.emptyContMess')} />
                ) : (
                  contacts.map((name) => (
                    <ContactEntry
                      key={name}
                      name={name}
                      addressCount={getContactAddressCount(name)}
                      onClick={() => handleViewContact(name)}
                      onDelete={() => handleDeleteContact(name)}
                    />
                  ))
                )}
              </FlexCol>
            )}
          </FlexCol>
        </Padded>
      </Content>
      {!selectionMode && (
        <ButtonsOnBottom>
          <Button
            onClick={handleAddNew}
            label={currentTab === 'myaccounts' ? t('apps.addressBook.addNewAcc') : t('apps.addressBook.addNewCont')}
          />
        </ButtonsOnBottom>
      )}
    </>
  )
}
