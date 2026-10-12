import { useTranslation } from 'react-i18next'
import { InfoLine } from './Info'
import InfoContainer from './InfoContainer'
import WhenIcon from '../icons/When'
import FeesIcon from '../icons/Fees'
import InfoIcon from '../icons/Info'
import type { InfoItem, InfoItemIcon } from '../lib/transferMethods'
import receiptIcon from '../../public/images/icons/ ReceiptReceipt.png'
import clockIcon from '../../public/images/icons/ Clock.svg'
import infoIcon from '../../public/images/icons/IconInfoIcon.png'

const imgStyle = { width: '16px', height: '16px', filter: 'brightness(0) invert(0.7)' }

/** Icon for a send/receive terms line (see TERMS_AND_CONDITIONS). */
export function termsIcon(iconType?: InfoItemIcon) {
  switch (iconType) {
    case 'time':
      return <WhenIcon />
    case 'fees':
      return <FeesIcon />
    case 'warning':
    case 'instruction':
      return undefined
    case 'info':
      return <img src={infoIcon} alt='info' style={imgStyle} />
    case 'receipt':
      return <img src={receiptIcon} alt='receipt' style={imgStyle} />
    case 'clock':
      return <img src={clockIcon} alt='clock' style={imgStyle} />
    default:
      return <InfoIcon />
  }
}

/** The InfoLines for a list of terms, without a container. */
export function TermsLines({ items }: { items: InfoItem[] }) {
  const { t } = useTranslation()
  return (
    <>
      {items.map((item) => (
        <InfoLine key={item.text} compact color={item.color} icon={termsIcon(item.icon)} text={t(item.text)} />
      ))}
    </>
  )
}

/** A boxed list of send/receive terms, e.g. `TERMS_AND_CONDITIONS.send.bank`. */
export default function TermsInfo({ items }: { items: InfoItem[] }) {
  return (
    <InfoContainer>
      <TermsLines items={items} />
    </InfoContainer>
  )
}
