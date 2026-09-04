import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { ToastProvider, toast } from '../../components/Toast'

/**
 * The safe-area offset that keeps toasts clear of the notch / Dynamic Island is
 * a CSS rule in Toast.css, selected by class + data attributes that sonner puts
 * on its own element. Nothing in the type system ties the two together, so
 * these assert the selector still matches what actually renders.
 */

const CSS = fs.readFileSync(path.resolve(__dirname, '../../components/Toast.css'), 'utf8')

describe('toast safe-area offset', () => {
  it('renders a toaster carrying the hooks the CSS selects on', async () => {
    const { baseElement } = render(<ToastProvider>{null}</ToastProvider>)

    // sonner renders nothing until a toast is queued
    toast('clearing the island')
    await screen.findByText('clearing the island')

    await waitFor(() => {
      const toaster = baseElement.querySelector('[data-sonner-toaster]')
      expect(toaster).not.toBeNull()
      expect(toaster).toHaveClass('arkade-toast-toaster')
      expect(toaster?.getAttribute('data-y-position')).toBe('top')

      // The exact selector the offset rule uses must match the live element.
      expect(
        baseElement.querySelector("[data-sonner-toaster].arkade-toast-toaster[data-y-position='top']"),
      ).toBe(toaster)
    })
  })

  it('offsets the top by the safe-area inset rather than a flat value', () => {
    const rule = CSS.match(
      /\[data-sonner-toaster\]\.arkade-toast-toaster\[data-y-position='top'\]\s*\{([^}]*)\}/,
    )
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/top:\s*calc\(env\(safe-area-inset-top[^)]*\)[^;]*\)\s*!important/)
  })

  it('does not route env() through a custom property, which iOS mishandles', () => {
    // sonner's offset props would set --offset-top / --mobile-offset-top.
    expect(CSS).not.toMatch(/--(mobile-)?offset-top\s*:/)
  })
})
