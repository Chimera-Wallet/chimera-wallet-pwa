import { GreenStatusIcon } from '../icons/Status'
import UnheckedIcon from '../icons/Unchecked'
import FlexCol from './FlexCol'
import FlexRow from './FlexRow'
import Text from './Text'
import { useTranslation } from 'react-i18next'

type CheckListData = {
  text: string
  done: boolean
}

interface CheckListProps {
  data: CheckListData[]
}

const Line = ({ row }: { row: CheckListData }) => (
  <>
    {row.done ? (
      <FlexRow>
        <GreenStatusIcon />
        <Text small color='green'>
          {row.text}
        </Text>
      </FlexRow>
    ) : (
      <FlexRow>
        <UnheckedIcon />
        <Text small>{row.text}</Text>
      </FlexRow>
    )}
  </>
)

export default function CheckList({ data }: CheckListProps) {
  const {t} = useTranslation()
  return (
    <FlexCol gap='0.5rem'>
      <Text smaller>{t('components.checkList.pass')}</Text>
      {data.map((row) => (
        <Line key={row.text} row={row} />
      ))}
    </FlexCol>
  )
}
