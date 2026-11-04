import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { useTranslation } from 'react-i18next'
import { getRecoverySuggestions, getRecoveryWord } from '../lib/recoveryInput'
import { hapticLight } from '../lib/haptics'
import ErrorMessage from './Error'
import FlexCol from './FlexCol'
import FlexRow from './FlexRow'
import Shadow from './Shadow'
import Text, { TextSecondary } from './Text'

interface InputRecoveryProps {
  value: string
  cursor: number | null
  error?: string
  helperText: string
  onChange: (value: string, cursor: number | null) => void
  onSubmit: () => void
}

/**
 * Recovery phrase / private key field with BIP39 word suggestions.
 *
 * Ported from arkade-os/wallet `InputNsec` (#1046, #1048). Suggestions are
 * offered for the word under the caret and only ever applied when the user
 * picks one: typed text is never rewritten, so a manually entered hex key or a
 * four-letter metal-plate prefix stays exactly as typed until chosen.
 */
export default function InputRecovery({ value, cursor, error, helperText, onChange, onSubmit }: InputRecoveryProps) {
  const { t } = useTranslation()
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const pendingCursor = useRef<number | null>(null)
  const [composing, setComposing] = useState(false)
  const suggestions = composing ? [] : getRecoverySuggestions(value, cursor)
  const label = t('init.restore.recoveryPhraseKey')

  // Accepting a suggestion can leave the value unchanged (an already complete
  // word), so the caret is restored on cursor changes as well as value changes.
  useLayoutEffect(() => {
    if (pendingCursor.current !== null) {
      inputRef.current?.setSelectionRange(pendingCursor.current, pendingCursor.current)
      pendingCursor.current = null
    }
  }, [value, cursor])

  return (
    <FlexCol gap='0.5rem'>
      <Text capitalize color='neutral-500' smaller>
        {label}
      </Text>
      <Autocomplete.Root
        value={value}
        items={suggestions}
        filter={null}
        openOnInputClick
        onValueChange={(next, details) => {
          if (details.reason === 'item-press') {
            const token = getRecoveryWord(value, cursor)
            if (!token) return
            const suffix = value.slice(token.end)
            const separator = /^\s/.test(suffix) ? '' : ' '
            const completed = value.slice(0, token.start) + next + separator + suffix
            // Advance over the inserted or existing space to the next word.
            const nextCursor = token.start + next.length + 1
            pendingCursor.current = nextCursor
            hapticLight()
            onChange(completed, nextCursor)
          } else {
            onChange(next, inputRef.current?.selectionStart ?? next.length)
          }
        }}
      >
        <div ref={anchorRef} style={{ width: '100%' }}>
          <Shadow>
            <FlexRow between>
              <Autocomplete.Input
                id={id}
                ref={inputRef}
                // e2e helpers locate the restore field by this name.
                name='private-key'
                aria-label={label}
                aria-describedby={`${id}-feedback`}
                aria-invalid={Boolean(error)}
                autoCapitalize='none'
                autoCorrect='off'
                autoComplete='off'
                spellCheck={false}
                className='input'
                onSelect={(event) => onChange(value, event.currentTarget.selectionStart)}
                onFocus={(event) => onChange(value, event.currentTarget.selectionStart)}
                onBlur={() => onChange(value, null)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
                onKeyDown={(event) => {
                  // Enter picks the highlighted suggestion when the list has one;
                  // otherwise it submits, but never mid-IME composition.
                  if (
                    event.key === 'Enter' &&
                    !event.nativeEvent.isComposing &&
                    !event.currentTarget.getAttribute('aria-activedescendant')
                  ) {
                    event.preventDefault()
                    onSubmit()
                  }
                }}
              />
            </FlexRow>
          </Shadow>
        </div>
        {suggestions.length > 0 ? (
          <Autocomplete.Portal>
            <Autocomplete.Positioner anchor={anchorRef} sideOffset={6} align='start' className='isolate z-50'>
              <Autocomplete.Popup
                // index.css forces `* { color: inherit }` outside Tailwind's layers, which beats a
                // text-* utility, and the portal inherits the body's colour rather than the app's.
                style={{ color: 'var(--fg)' }}
                className='max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-lg bg-popover shadow-md ring-1 ring-foreground/10'
              >
                <Autocomplete.List
                  aria-label={t('init.restore.wordSuggestions')}
                  className='max-h-60 overflow-y-auto overscroll-contain p-1'
                >
                  {(word: string) => (
                    <Autocomplete.Item
                      key={word}
                      value={word}
                      className='flex min-h-11 w-full cursor-pointer items-center rounded-md px-3 text-base outline-hidden select-none data-highlighted:bg-accent'
                    >
                      {word}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        ) : null}
      </Autocomplete.Root>
      <div id={`${id}-feedback`} aria-live='polite'>
        {error ? <ErrorMessage error text={error} /> : <TextSecondary wrap>{helperText}</TextSecondary>}
      </div>
    </FlexCol>
  )
}
