import { useContext, useEffect, useState } from 'react'
import { AspContext } from '../../providers/asp'
import Header from './Header'
import Table, { TableData } from '../../components/Table'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import { gitCommit } from '../../_gitCommit'
import { prettyDelta } from '../../lib/format'
import FlexCol from '../../components/FlexCol'
import ErrorMessage from '../../components/Error'
import {useTranslation} from 'react-i18next'

export default function About() {
  const { aspInfo } = useContext(AspContext)

  const [error, setError] = useState(false)

  const {t} = useTranslation()

  useEffect(() => {
    setError(aspInfo.unreachable)
  }, [aspInfo.unreachable])

  const data: TableData = [
    [t('settings.about.serverURL'), aspInfo.url],
    [t('settings.about.serverPubkey'), aspInfo.signerPubkey],
    [t('settings.about.forfeitAddress'), aspInfo.forfeitAddress],
    [t('common.general.network'), aspInfo.network],
    [t('common.general.dust'), `${aspInfo.dust} SATS`],
    [t('settings.about.sessionDur'), prettyDelta(Number(aspInfo.sessionDuration), true)],
    [t('settings.about.boardingDelay'), prettyDelta(Number(aspInfo.boardingExitDelay), true)],
    [t('settings.about.unilateralDelay'), prettyDelta(Number(aspInfo.unilateralExitDelay), true)],
    [t('settings.about.gitHash'), gitCommit],
  ]

  return (
    <>
      <Header text={t('common.general.about')} back />
      <Content>
        <Padded>
          <FlexCol>
            <ErrorMessage error={error} text={t('errors.send.arkade.server')} />
            <Table data={data} />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
