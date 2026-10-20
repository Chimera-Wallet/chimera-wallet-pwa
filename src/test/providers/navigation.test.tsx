import { useContext } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { NavigationContext, NavigationProvider, Pages } from '../../providers/navigation'

vi.mock('../../lib/analytics', () => ({ trackPageView: vi.fn() }))

// Like the browser, history.go() is followed by a popstate event
const mockHistoryGo = () =>
  vi.spyOn(history, 'go').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

function renderNavigation() {
  const ctx: { current?: React.ContextType<typeof NavigationContext> } = {}
  function Probe() {
    ctx.current = useContext(NavigationContext)
    return null
  }
  render(
    <NavigationProvider>
      <Probe />
    </NavigationProvider>,
  )
  return ctx
}

describe('NavigationProvider popTo', () => {
  it('returns to a page directly behind the current one', () => {
    const go = mockHistoryGo()
    const nav = renderNavigation()

    act(() => nav.current!.navigate(Pages.Wallet))
    act(() => nav.current!.navigate(Pages.SendForm))
    act(() => nav.current!.navigate(Pages.AppAddressBook))
    act(() => nav.current!.popTo(Pages.SendForm))

    expect(nav.current!.screen).toBe(Pages.SendForm)
    expect(go).toHaveBeenLastCalledWith(-1)
    go.mockRestore()
  })

  it('unwinds several pages and leaves the target off its own back stack', () => {
    const go = mockHistoryGo()
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const nav = renderNavigation()

    act(() => nav.current!.navigate(Pages.Apps))
    act(() => nav.current!.navigate(Pages.AppPos))
    act(() => nav.current!.navigate(Pages.AppPosPayment))
    act(() => nav.current!.navigate(Pages.AppPosStatus))
    act(() => nav.current!.popTo(Pages.AppPos))

    expect(nav.current!.screen).toBe(Pages.AppPos)
    expect(go).toHaveBeenLastCalledWith(-2)

    // one more back goes to Apps, not to a duplicate AppPos entry
    act(() => nav.current!.goBack())
    expect(back).toHaveBeenCalledTimes(1)
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(nav.current!.screen).toBe(Pages.Apps)

    go.mockRestore()
    back.mockRestore()
  })

  it('keeps the back stack right for navigation after a popTo', () => {
    // A sale's status page closes back to the terminal; the terminal must then
    // be what's behind the next page opened (here the payment history), or a
    // later popTo can't find it and the status page can't be left.
    const go = mockHistoryGo()
    const nav = renderNavigation()

    act(() => nav.current!.navigate(Pages.Apps))
    act(() => nav.current!.navigate(Pages.AppPos))
    act(() => nav.current!.navigate(Pages.AppPosPayment))
    act(() => nav.current!.navigate(Pages.AppPosStatus))
    act(() => nav.current!.popTo(Pages.AppPos))

    act(() => nav.current!.navigate(Pages.AppPosHistory))
    act(() => nav.current!.navigate(Pages.AppPosStatus))
    act(() => nav.current!.popTo(Pages.AppPos))

    expect(nav.current!.screen).toBe(Pages.AppPos)
    expect(go).toHaveBeenLastCalledWith(-2)
    go.mockRestore()
  })

  it('replace takes the current page out of the back stack', () => {
    const replace = vi.spyOn(history, 'replaceState')
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const nav = renderNavigation()

    act(() => nav.current!.navigate(Pages.Apps))
    act(() => nav.current!.navigate(Pages.AppPos))
    act(() => nav.current!.navigate(Pages.AppPosPayment))
    act(() => nav.current!.navigate(Pages.AppPosStatus, { paymentId: 'p' }, { replace: true }))
    expect(replace).toHaveBeenCalled()

    // back from the status page skips the payment page
    act(() => nav.current!.goBack())
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(nav.current!.screen).toBe(Pages.AppPos)

    replace.mockRestore()
    back.mockRestore()
  })

  it('does nothing when the target is not in the back stack', () => {
    const go = mockHistoryGo()
    const nav = renderNavigation()

    act(() => nav.current!.navigate(Pages.Apps))
    act(() => nav.current!.navigate(Pages.AppPos))
    act(() => nav.current!.popTo(Pages.Settings))

    expect(nav.current!.screen).toBe(Pages.AppPos)
    expect(go).not.toHaveBeenCalled()
    go.mockRestore()
  })
})
