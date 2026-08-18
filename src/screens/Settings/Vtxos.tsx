import { ReactNode, useContext, useEffect, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import { WalletContext } from '../../providers/wallet'
import { prettyAgo, prettyDate, prettyDelta, prettyHide, prettyNumber } from '../../lib/format'
import Header from './Header'
import Text, { TextSecondary } from '../../components/Text'
import FlexCol from '../../components/FlexCol'
import { Vtxo } from '../../lib/types'
import FlexRow from '../../components/FlexRow'
import { ConfigContext } from '../../providers/config'
import { extractError } from '../../lib/error'
import ErrorMessage from '../../components/Error'
import Info from '../../components/Info'
import LoadingIcon from '../../icons/Loading'
import { AspContext } from '../../providers/asp'
import Reminder from '../../components/Reminder'
import { getInputsToSettle, settleVtxos } from '../../lib/asp'
import LoadingLogo from '../../components/LoadingLogo'
import { LimitsContext } from '../../providers/limits'
import { EmptyCoinsList } from '../../components/Empty'
import WarningBox from '../../components/Warning'
import { ExtendedCoin, ExtendedVirtualCoin, isVtxoExpiringSoon } from '@arkade-os/sdk'
import { consoleError } from '../../lib/logs'
import * as Sentry from '@sentry/react'
import Grid from '../../components/Grid'
import { prettyAssetAmount } from '../../lib/assets'
import {useTranslation} from 'react-i18next'

export default function Vtxos() {
  const { aspInfo, calcBestMarketHour } = useContext(AspContext)
  const { config } = useContext(ConfigContext)
  const { utxoTxsAllowed, vtxoTxsAllowed } = useContext(LimitsContext)
  const { assetMetadataCache, reloadWallet, vtxos, vtxoManager, wallet, svcWallet } = useContext(WalletContext)
  const {t} = useTranslation()

  const defaultLabel = t('settings.vtxo.renewVC')

  const [aboveDust, setAboveDust] = useState(false)
  const [allUtxos, setAllUtxos] = useState<ExtendedCoin[]>([])
  const [allVtxos, setAllVtxos] = useState<ExtendedVirtualCoin[]>([])
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [hasInputsToSettle, setHasInputsToSettle] = useState(false)
  const [hideUtxos, setHideUtxos] = useState(false)
  const [label, setLabel] = useState(defaultLabel)
  const [loading, setLoading] = useState(true)
  const [rollingover, setRollingover] = useState(false)
  const [reminderIsOpen, setReminderIsOpen] = useState(false)
  const [showList, setShowList] = useState(false)
  const [startTime, setStartTime] = useState(0)
  const [success, setSuccess] = useState(false)
  const [hasVtxosToSettle, setHasVtxosToSettle] = useState(false)
  const [hasBoardingUtxosToSettle, setHasBoardingUtxosToSettle] = useState(false)

  // Update error state if aspInfo.unreachable changes
  useEffect(() => {
    setError(aspInfo.unreachable ? t('errors.send.arkade.server') : '')
  }, [aspInfo.unreachable])

  // Update label based on rolling over state and dust status
  useEffect(() => {
    setLabel(
      !aboveDust
        ? t('settings.vtxo.belowDust')
        : hasVtxosToSettle && hasBoardingUtxosToSettle && !hideUtxos
          ?  t('settings.vtxo.completeBoardRen')
          : hasVtxosToSettle
            ?  t('settings.vtxo.renew')
            : hasBoardingUtxosToSettle && !hideUtxos
              ?  t('settings.vtxo.complBoard')
              : '',
    )
  }, [rollingover, aboveDust, hasVtxosToSettle, hasBoardingUtxosToSettle, hideUtxos])

  // Calculate best market hour when wallet.nextRollover changes
  useEffect(() => {
    const bestMarketHour = calcBestMarketHour(wallet.nextRollover)
    if (bestMarketHour) {
      setStartTime(Number(bestMarketHour.nextStartTime))
      setDuration(Number(bestMarketHour.duration))
    } else {
      setStartTime(wallet.nextRollover)
      setDuration(0)
    }
  }, [wallet.nextRollover])

  // Fetch all VTXOs and all UTXOs
  useEffect(() => {
    if (!aspInfo || !svcWallet) return
    // get all VTXOs including recoverable ones
    const fetchData = async () => {
      try {
        const [vtxosData, utxosData] = await Promise.all([
          svcWallet.getVtxos({
            withRecoverable: true,
            withUnrolled: false,
          }),
          svcWallet.getBoardingUtxos(),
        ])
        const ordered = [...vtxosData].sort((a, b) => a.value - b.value)
        setAllVtxos(ordered)
        setAllUtxos(utxosData)
        setLoading(false)
      } catch (err) {
        consoleError(err)
        setError(t('errors.vtxo.failedFetch'))
        setLoading(false)
      }
    }
    fetchData()
  }, [aspInfo, vtxos, svcWallet, wallet.thresholdMs])

  // Fetch inputs to settle
  useEffect(() => {
    if (!aspInfo || !svcWallet || !vtxoManager) return
    let cancelled = false
    const fetchInputs = async () => {
      try {
        const { boardingUtxos, inputs, vtxos } = await getInputsToSettle(svcWallet, vtxoManager, wallet.thresholdMs)
        if (cancelled) return
        setHasBoardingUtxosToSettle(boardingUtxos.length > 0)
        setHasInputsToSettle(inputs.length > 0)
        setHasVtxosToSettle(vtxos.length > 0)
        const amount = inputs.reduce((a, v) => a + v.value, 0) || 0
        setAboveDust(amount > aspInfo.dust)
      } catch (err) {
        if (cancelled) return
        consoleError(err)
      }
    }
    fetchInputs()
    return () => {
      cancelled = true
    }
  }, [allUtxos, allVtxos, aspInfo, svcWallet, vtxoManager, wallet.thresholdMs])

  // Automatically reset `success` after 5s, with cleanup on unmount or re-run
  useEffect(() => {
    if (!success) return
    setHideUtxos(true)
    const timeoutId = setTimeout(() => setSuccess(false), 5_000)
    return () => clearTimeout(timeoutId)
  }, [success])

  if (!svcWallet || !vtxoManager || loading) return <LoadingLogo text={t('common.general.loading')} />

  const listableVtxos = allVtxos.filter((vtxo) => vtxo.isSpent === false)

  const handleRollover = async () => {
    try {
      setRollingover(true)
      await settleVtxos(svcWallet, vtxoManager, aspInfo.dust, wallet.thresholdMs)
      await reloadWallet()
      setRollingover(false)
      setSuccess(true)
    } catch (err) {
      Sentry.captureException(err, {
        tags: { function: 'renewVtxos:handleRollover' },
      })
      setError(extractError(err))
      setRollingover(false)
    }
  }

  const Box = ({ children }: { children: ReactNode }) => {
    const style: React.CSSProperties = {
      backgroundColor: 'var(--neutral-100)',
      border: '1px solid var(--neutral-200)',
      borderRadius: '0.25rem',
      padding: '10px',
      width: '100%',
    }
    return (
      <div style={style}>
        <FlexRow between>{children}</FlexRow>
      </div>
    )
  }

  const Tags = {
    settled: (
      <Text color='green' smaller>
        {t('settings.vtxo.settled')}
      </Text>
    ),
    subdust: (
      <Text color='orange' smaller>
         {t('settings.vtxo.subdust')}
      </Text>
    ),
    swept: (
      <Text color='orange' smaller>
         {t('settings.vtxo.swpt')}
      </Text>
    ),
    unconfirmed: (
      <Text color='orange' smaller>
         {t('settings.vtxo.unconfirmed')}
      </Text>
    ),
    expiring: (
      <Text color='red' smaller>
         {t('settings.vtxo.expSoon')}
      </Text>
    ),
  }

  const CoinLine = ({
    amount,
    assets,
    tags,
    expiry,
  }: {
    amount: string
    assets?: string[]
    tags: React.ReactNode
    expiry: string
  }) => {
    const style: React.CSSProperties = {
      backgroundColor: 'var(--neutral-100)',
      border: '1px solid var(--neutral-200)',
      borderRadius: '0.25rem',
      padding: '0',
      width: '100%',
    }
    return (
      <div style={style}>
        <Grid>
          <div>
            <div>
              <FlexCol gap='0.25rem'>
                <Text>{amount}</Text>
                {assets?.map((a) => (
                  <Text key={a} color='neutral-500' smaller>
                    {a}
                  </Text>
                ))}
              </FlexCol>
            </div>
            <div>{tags}</div>
            <div>
              <Text right>{expiry}</Text>
            </div>
          </div>
        </Grid>
      </div>
    )
  }

  const VtxoLine = ({ vtxo }: { vtxo: Vtxo }) => {
    const now = Date.now()
    const expired = vtxo.virtualStatus?.batchExpiry ? now > vtxo.virtualStatus.batchExpiry : false
    const satsAmount = config.showBalance ? prettyNumber(vtxo.value) : prettyHide(vtxo.value)
    const assetsAmounts = vtxo.assets?.length
      ? vtxo.assets.map((a) => {
          const meta = assetMetadataCache.get(a.assetId)?.metadata
          const decimals = meta?.decimals ?? 8
          const label = meta?.ticker ?? `${a.assetId.slice(0, 8)}...`
          return `${prettyAssetAmount(a.amount, decimals)} ${label}`
        })
      : []
    const expiry = vtxo.virtualStatus?.batchExpiry ? prettyAgo(vtxo.virtualStatus.batchExpiry) : t('common.general.unkown')
    const tags = (
      <FlexRow centered>
        {vtxo.value < aspInfo.dust
          ? Tags.subdust
          : vtxo.virtualStatus?.state === 'swept' || expired
            ? Tags.swept
            : wallet.thresholdMs && isVtxoExpiringSoon(vtxo, wallet.thresholdMs)
              ? Tags.expiring
              : vtxo.virtualStatus?.state === 'settled'
                ? Tags.settled
                : null}
      </FlexRow>
    )
    return <CoinLine amount={`${satsAmount} SATS`} assets={assetsAmounts} tags={tags} expiry={expiry} />
  }

  const UtxoLine = ({ utxo }: { utxo: ExtendedCoin }) => {
    const expiration = Number(aspInfo.boardingExitDelay)
    const amount = config.showBalance ? prettyNumber(utxo.value) : prettyHide(utxo.value)
    const expiry = utxo.status.block_time ? prettyAgo(utxo.status.block_time + expiration) : ''
    const tags = (
      <FlexRow centered>
        {!utxo.status.block_time ? Tags.unconfirmed : utxo.value < aspInfo.dust ? Tags.subdust : null}
      </FlexRow>
    )
    return <CoinLine amount={`${amount} SATS`} tags={tags} expiry={expiry} />
  }

  return (
    <>
      <Header
        auxFunc={() => setShowList(!showList)}
        auxText={showList ? 'Date' : 'Coins'}
        back
        text={showList ?  t('settings.vtxo.vc'): t('settings.vtxo.renewal')}
      />
      <Content>
        <Padded>
          <FlexCol className='scroll-fade'>
            <ErrorMessage error={Boolean(error)} text={error} />
            {rollingover ? (
              <Info color='purple' icon={<LoadingIcon small />} title={t('settings.vtxo.renewing')}>
                <Text wrap>{t('settings.vtxo.renewVCs')}</Text>
              </Info>
            ) : null}
            {listableVtxos.length + allUtxos.length === 0 ? (
              <EmptyCoinsList />
            ) : showList ? (
              <FlexCol gap='2rem'>
                {success ? <WarningBox green text='Coins renewed successfully' /> : null}
                {listableVtxos.length > 0 ? (
                  <FlexCol gap='0.5rem'>
                    <Text capitalize color='neutral-500' smaller>
                      {t('settings.vtxo.VClist')}
                    </Text>
                    {listableVtxos.map((v: ExtendedVirtualCoin) => (
                      <VtxoLine key={v.txid} vtxo={v} />
                    ))}
                  </FlexCol>
                ) : null}
                {!hideUtxos && allUtxos.length > 0 ? (
                  <FlexCol gap='0.5rem'>
                    <Text capitalize color='neutral-500' smaller>
                      {t('settings.vtxo.utxoList')}
                    </Text>
                    {allUtxos.map((u: ExtendedCoin) => (
                      <UtxoLine key={u.txid} utxo={u} />
                    ))}
                  </FlexCol>
                ) : null}
              </FlexCol>
            ) : (
              <>
                <FlexCol gap='0.5rem' margin='0 0 1rem 0'>
                  <Text capitalize color='neutral-500' smaller>
                    {t('settings.vtxo.nextren')}
                  </Text>
                  <Box>
                    <Text>{prettyDate(wallet.nextRollover)}</Text>
                    <Text>{prettyAgo(wallet.nextRollover)}</Text>
                  </Box>
                  {success ? <WarningBox green text='Coins renewed successfully' /> : null}
                </FlexCol>
                <FlexCol gap='0.5rem' margin='2rem 0 0 0'>
                  <TextSecondary>{t('settings.vtxo.firstExpt', {exp: prettyAgo(wallet.nextRollover)})}.</TextSecondary>
                  {wallet.thresholdMs ? (
                    <TextSecondary>
                      {t('settings.vtxo.autoRen')}{' '}
                      {prettyDelta(Math.floor(wallet.thresholdMs / 1_000))}.
                    </TextSecondary>
                  ) : null}
                  {startTime && duration ? (
                    <>
                      <TextSecondary>{t('settings.vtxo.marketFees')}</TextSecondary>
                      <TextSecondary>
                        {t('settings.vtxo.nextHour', {st: prettyDate(startTime) , bool: prettyAgo(startTime,true) , duration: prettyDelta(duration)})}
                      </TextSecondary>
                    </>
                  ) : null}
                </FlexCol>
              </>
            )}
          </FlexCol>
        </Padded>
      </Content>
      {utxoTxsAllowed() && vtxoTxsAllowed() ? (
        <>
          <ButtonsOnBottom>
            {hasInputsToSettle && !hideUtxos ? (
              <Button onClick={handleRollover} label={label} disabled={rollingover || !aboveDust} />
            ) : null}
            {wallet.nextRollover ? (
              <Button onClick={() => setReminderIsOpen(true)} label={t('settings.vtxo.addRem')} secondary />
            ) : null}
          </ButtonsOnBottom>
          <Reminder
            callback={() => setReminderIsOpen(false)}
            duration={duration}
            isOpen={reminderIsOpen}
            name={t('settings.vtxo.vcRenewal')}
            startTime={wallet.nextRollover}
          />
        </>
      ) : null}
    </>
  )
}
