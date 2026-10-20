import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from './Button'
import FlexCol from './FlexCol'
import Focusable from './Focusable'
import Input from './Input'
import SheetModal from './SheetModal'
import Text, { TextSecondary } from './Text'
import NotesIcon from '../icons/Notes'
import { hapticSubtle } from '../lib/haptics'

/** Longest note accepted — the POS sale note and the transaction note alike. */
export const NOTE_MAX_LENGTH = 140

interface NoteSheetProps {
  isOpen: boolean
  onClose: () => void
  /** The saved note; the draft starts from it each time the sheet opens. */
  value: string
  /** Called with the new note, '' when removed. The sheet closes itself. */
  onSave: (note: string) => void
  placeholder?: string
  testId?: string
}

/** Bottom sheet to write, change or remove a note. */
export function NoteSheet({ isOpen, onClose, value, onSave, placeholder, testId }: NoteSheetProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (isOpen) setDraft(value)
  }, [isOpen, value])

  const save = (note: string) => {
    onSave(note.trim())
    onClose()
  }

  return (
    <SheetModal isOpen={isOpen} onClose={onClose}>
      <FlexCol gap='1rem' padding='0.5rem 0'>
        <Text big bold>
          {t('components.note.title')}
        </Text>
        <Input
          focus
          maxLength={NOTE_MAX_LENGTH}
          value={draft}
          onChange={setDraft}
          placeholder={placeholder}
          onEnter={() => save(draft)}
          testId={testId}
        />
        <Button label={t('components.note.save')} onClick={() => save(draft)} />
        {value ? <Button label={t('components.note.clear')} secondary onClick={() => save('')} /> : null}
      </FlexCol>
    </SheetModal>
  )
}

interface EditableNoteProps {
  value: string
  onSave: (note: string) => void
  placeholder?: string
  testId?: string
}

/** A note row that opens the note sheet: the note itself, or "Add note". */
export default function EditableNote({ value, onSave, placeholder, testId = 'note' }: EditableNoteProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const edit = () => {
    hapticSubtle()
    setOpen(true)
  }

  const label = value ? t('components.note.edit') : t('components.note.add')

  return (
    <>
      <Focusable onEnter={edit} ariaLabel={label}>
        <div
          data-testid={testId}
          onClick={edit}
          style={{
            alignItems: 'center',
            backgroundColor: 'var(--surface)',
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
          }}
        >
          <span style={{ color: 'var(--neutral-500)', display: 'flex' }}>
            <NotesIcon small />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {value ? (
              <FlexCol gap='0.125rem'>
                <TextSecondary>{t('components.note.title')}</TextSecondary>
                <Text wrap>{value}</Text>
              </FlexCol>
            ) : (
              <TextSecondary>{t('components.note.add')}</TextSecondary>
            )}
          </div>
          <span aria-label={label} style={{ color: 'var(--neutral-500)', display: 'flex' }}>
            <Pencil size={16} />
          </span>
        </div>
      </Focusable>
      <NoteSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        value={value}
        onSave={onSave}
        placeholder={placeholder}
        testId={`${testId}-input`}
      />
    </>
  )
}
