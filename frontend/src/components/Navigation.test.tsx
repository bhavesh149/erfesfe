import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DesktopSidebar, MobileNavigation } from './Navigation'

describe('mobile navigation', () => {
  it('opens a modal drawer, closes after navigation and restores focus', async () => {
    render(<MemoryRouter><MobileNavigation search="?cutoff=09%3A00" /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await userEvent.click(trigger)
    const drawer = screen.getByRole('dialog', { name: 'Workspace navigation' })
    const link = within(drawer).getByRole('link', { name: 'Forecast accuracy' })
    expect(link).toHaveAttribute('href', '/accuracy?cutoff=09%3A00')
    await userEvent.click(link)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('closes with Escape and a labelled close button', async () => {
    render(<MemoryRouter><MobileNavigation search="" /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('sidebar scroll containment', () => {
  it('prevents page scrolling at sidebar boundaries while allowing inner scrolling and zoom', () => {
    render(<MemoryRouter><DesktopSidebar search="" /></MemoryRouter>)
    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' })
    const wheel = (deltaY: number, ctrlKey = false) => {
      const event = new WheelEvent('wheel', { deltaY, ctrlKey, bubbles: true, cancelable: true })
      sidebar.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(wheel(100)).toBe(true)
    expect(wheel(-100)).toBe(true)
    Object.defineProperties(sidebar, {
      scrollHeight: { value: 1000 }, clientHeight: { value: 500 },
      scrollTop: { value: 200, writable: true },
    })
    expect(wheel(100)).toBe(false)
    sidebar.scrollTop = 500
    expect(wheel(100)).toBe(true)
    expect(wheel(100, true)).toBe(false)
  })
})
