import Loading from './Loading'

// LoadingLogo has been replaced by the Chimera loading screen.
// This shim keeps existing imports working.
export default function LoadingLogo({ text }: { text?: string }) {
  return <Loading text={text} />
}
