import { useContext, useMemo, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Shadow from '../../components/Shadow'
import { TextSecondary } from '../../components/Text'
import KeyIcon from '../../icons/Key'
import EyeIcon from '../../icons/Eye'
import CopyIcon from '../../icons/Copy'
import SafeIcon from '../../icons/Safe'
import DontIcon from '../../icons/Dont'
import XIcon from '../../icons/X'
import { copyToClipboard } from '../../lib/clipboard'
import { privateKeyToNsec } from '../../lib/privateKey'
import { NavigationContext, Pages } from '../../providers/navigation'
import { useToast } from '../../components/Toast'
import { FlowContext } from '../../providers/flow'

export default function InitBackupKey() {
  const { navigate } = useContext(NavigationContext)
  const { initInfo, setInitInfo } = useContext(FlowContext)
  const { toast } = useToast()

  const mnemonic = initInfo.mnemonic ?? ''
  const words = useMemo(() => (mnemonic ? mnemonic.trim().split(/\s+/) : []), [mnemonic])
  // Fallback: if no mnemonic (old private-key-only wallets), show nsec
  const nsec = useMemo(
    () => (!mnemonic && initInfo.privateKey ? privateKeyToNsec(initInfo.privateKey) : ''),
    [mnemonic, initInfo.privateKey],
  )

  const isMnemonic = words.length > 0
  const [revealed, setRevealed] = useState(true)

  const handleCopy = async () => {
    const value = isMnemonic ? mnemonic : nsec
    if (!value) return
    await copyToClipboard(value)
    toast('Copied to clipboard')
  }

  const handleProceed = () => {
    setInitInfo({ ...initInfo, backupDone: true })
    navigate(Pages.InitBiometric)
  }

  return (
    <>
      <Header text={isMnemonic ? 'Save your Recovery Phrase' : 'Save your Private Key'} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <Shadow lighter>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    backgroundColor: 'var(--neutral-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--fg)',
                  }}
                >
                  <KeyIcon size={28} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <TextSecondary wrap>
                    {isMnemonic
                      ? 'This is the only way to restore your wallet on another browser or device. Store it somewhere safe — a password manager, encrypted notes, or written down securely.'
                      : 'This is your private key. Store it somewhere safe — a password manager, encrypted notes, or written down securely.'}
                  </TextSecondary>
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <FlexRow gap='0.5rem'>
                    <SafeIcon />
                    <TextSecondary>{isMnemonic ? 'Keep your recovery phrase safe' : 'Keep your private key safe'}</TextSecondary>
                  </FlexRow>
                  <FlexRow gap='0.5rem'>
                    <DontIcon />
                    <TextSecondary>Don't share it with anyone</TextSecondary>
                  </FlexRow>
                  <FlexRow gap='0.5rem'>
                    <XIcon />
                    <TextSecondary>If you lose it you can't recover it</TextSecondary>
                  </FlexRow>
                </div>

                {isMnemonic ? (
                  <div style={{ width: '100%' }}>
                    {revealed ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '0.5rem',
                          width: '100%',
                        }}
                      >
                        {words.map((word, i) => (
                          <div
                            key={`word-${word}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              backgroundColor: 'var(--input-bg)',
                              border: '1px solid var(--input-border-color)',
                              borderRadius: '0.5rem',
                              padding: '0.4rem 0.5rem',
                              fontSize: '0.8rem',
                            }}
                          >
                            <span style={{ color: 'var(--neutral-500)', fontSize: '0.7rem', minWidth: '1.2rem' }}>
                              {i + 1}.
                            </span>
                            <span style={{ color: 'var(--fg)', fontFamily: 'monospace' }}>{word}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          backgroundColor: 'var(--input-bg)',
                          border: '1px solid var(--input-border-color)',
                          borderRadius: '0.5rem',
                          padding: '1rem',
                          textAlign: 'center',
                          fontSize: '0.85rem',
                          color: 'var(--neutral-500)',
                          letterSpacing: '0.2em',
                        }}
                      >
                        {'• '.repeat(12).trim()}
                      </div>
                    )}
                    <button
                      onClick={() => setRevealed((v) => !v)}
                      style={{
                        marginTop: '0.5rem',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--neutral-500)',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: 0,
                      }}
                    >
                      <EyeIcon size={16} />
                      {revealed ? 'Hide phrase' : 'Reveal phrase'}
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input
                      readOnly
                      value={revealed ? nsec : '••••••••••••••••••••••••••••••••••••••••••••'}
                      data-testid='onboarding-private-key'
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        backgroundColor: 'var(--input-bg)',
                        border: '1px solid var(--input-border-color)',
                        borderRadius: 'var(--input-border-radius)',
                        color: 'var(--fg)',
                        padding: '0.6rem 2.75rem 0.6rem 0.75rem',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        minHeight: 'var(--input-height)',
                        outline: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    />
                    <button
                      onClick={() => setRevealed((v) => !v)}
                      aria-label={revealed ? 'Hide private key' : 'Reveal private key'}
                      style={{
                        position: 'absolute',
                        right: '0.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: 'var(--neutral-500)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <EyeIcon size={20} />
                    </button>
                  </div>
                )}

                <Button
                  onClick={handleCopy}
                  label={isMnemonic ? 'Copy Recovery Phrase' : 'Copy Private Key'}
                  icon={<CopyIcon />}
                />
              </div>
            </Shadow>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleProceed} label="I've saved it — Go to wallet" />
        <Button onClick={handleProceed} label='Skip for now' secondary clear />
      </ButtonsOnBottom>
    </>
  )
}