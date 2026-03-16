import { useContext } from 'react'
import ArrowIcon from '../icons/Arrow'
import { Option, OptionsContext } from '../providers/options'
import Text from './Text'
import FlexRow from './FlexRow'
import { SettingsOptions } from '../lib/types'
import FlexCol from './FlexCol'
import Focusable from './Focusable'
import { hapticSubtle } from '../lib/haptics'

interface MenuProps {
  rows: Option[]
  styled?: boolean
}

export default function Menu({ rows, styled }: MenuProps) {
  const { setOption } = useContext(OptionsContext)

  const bgColor = styled ? 'var(--info-container-bg)' : 'transparent'

  const rowStyle = (option: SettingsOptions, isFirst: boolean, isLast: boolean) => ({
    alignItems: 'center',
    backgroundColor: option === SettingsOptions.Reset ? 'var(--redbg)' : bgColor,
    borderBottom: '1px solid var(--dark10)',
    borderTopLeftRadius: isFirst ? 'var(--info-container-radius)' : '0',
    borderTopRightRadius: isFirst ? 'var(--info-container-radius)' : '0',
    borderBottomLeftRadius: isLast ? 'var(--info-container-radius)' : '0',
    borderBottomRightRadius: isLast ? 'var(--info-container-radius)' : '0',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.7rem 1rem',
    width: '100%',
  })

  return (
    <FlexCol gap='0'>
      {rows.map(({ icon, option }, index) => (
        <Focusable
          onEnter={() => {
            hapticSubtle()
            setOption(option)
          }}
          key={option}
        >
          <FlexRow between>
            <div
              onClick={() => {
                hapticSubtle()
                setOption(option)
              }}
              style={rowStyle(option, index === 0, index === rows.length - 1)}
            >
              <FlexRow>
                {styled ? icon : null}
                <Text capitalize>{option}</Text>
              </FlexRow>
              <ArrowIcon />
            </div>
          </FlexRow>
        </Focusable>
      ))}
    </FlexCol>
  )
}
