import { useContext, useEffect, useState } from 'react'
import { ArkNote } from '@arkade-os/sdk'
import ErrorMessage from '../../../components/Error'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import Padded from '../../../components/Padded'
import Content from '../../../components/Content'
import { isArkNote } from '../../../lib/arknote'
import { ConfigContext } from '../../../providers/config'
import Header from '../../../components/Header'
import InputNote from '../../../components/InputNote'
import Scanner from '../../../components/Scanner'
import { OptionsContext } from '../../../providers/options'
import { extractError } from '../../../lib/error'
import FlexCol from '../../../components/FlexCol'
import { consoleError } from '../../../lib/logs'
import { SettingsOptions } from '../../../lib/types'
import { AspContext } from '../../../providers/asp'
import {useTranslation} from 'react-i18next'

export default function NotesForm() {
  const { aspInfo } = useContext(AspContext)
  const { showConfig, toggleShowConfig } = useContext(ConfigContext)
  const { setNoteInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)
  const { setOption } = useContext(OptionsContext)

  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [scan, setScan] = useState(false)
  
  const {t} = useTranslation()

  useEffect(() => {
    setError(aspInfo.unreachable ? t('errors.send.arkade.server') : '')
  }, [aspInfo.unreachable])

  useEffect(() => {
    if (!note) return
    if (isArkNote(note)) {
      try {
        setError('')
        const { value } = ArkNote.fromString(note)
        setNoteInfo({ note, satoshis: value })
        if (showConfig) toggleShowConfig()
        return navigate(Pages.NotesRedeem)
      } catch (err) {
        setError(extractError(err))
        consoleError(err, 'error decoding note')
      }
    }
  }, [note])

  const handleBack = () => {
    setOption(SettingsOptions.Menu)
    navigate(Pages.Settings)
  }

  if (scan) return <Scanner close={() => setScan(false)} label={t('common.general.notes.arkNote')} onData={setNote} onError={setError} />

  return (
    <>
      <Header text={t('common.general.notes.note')} back={handleBack} />
      <Content>
        <Padded>
          <FlexCol gap='2rem'>
            <ErrorMessage error={Boolean(error)} text={error} />
            <InputNote label={t('common.general.notes.arkNote')} onChange={setNote} openScan={() => setScan(true)} value={note} />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
