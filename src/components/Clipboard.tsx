import Paste from './Paste'

interface ClipboardProps {
  validator?: (arg0: string) => boolean
  onPaste: (arg0: string) => void
}

export default function Clipboard({ validator, onPaste }: ClipboardProps) {
  return <Paste validator={validator} onPaste={onPaste} />
}
