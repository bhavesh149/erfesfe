import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Filters from './Filters'

describe('analysis filter dialog', () => {
  it('cancels draft edits, restores focus and resets drafts when reopened', async () => {
    const apply = vi.fn()
    render(<Filters basis="decision" cutoff="10:00" apply={apply} />)
    const trigger = screen.getByRole('button', { name: 'Edit filters' })
    await userEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Analysis filters' })
    expect(dialog).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('radio', { name: /Delivery dates/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: '12:00' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(apply).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
    await userEvent.click(trigger)
    expect(screen.getByRole('radio', { name: /Decision dates/ })).toBeChecked()
    expect(screen.getByRole('button', { name: '10:00' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('supports a custom hour and minute, then applies both atomically', async () => {
    const apply = vi.fn()
    render(<Filters basis="delivery" cutoff="10:00" apply={apply} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit filters' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Cutoff hour' }))
    await userEvent.click(await screen.findByRole('option', { name: /^22$/ }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Cutoff minute' }))
    await userEvent.click(await screen.findByRole('option', { name: /^17$/ }))
    expect(apply).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(apply).toHaveBeenCalledExactlyOnceWith('delivery', '22:17')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('supports Escape and leaves committed filters untouched', async () => {
    const apply = vi.fn()
    render(<Filters basis="delivery" cutoff="08:15" apply={apply} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit filters' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset defaults' }))
    await userEvent.keyboard('{Escape}')
    expect(apply).not.toHaveBeenCalled()
    expect(screen.getByText('08:15')).toBeInTheDocument()
    expect(screen.getByText('Delivery dates')).toBeInTheDocument()
  })

  it('contains keyboard focus inside the dialog', async () => {
    render(<Filters basis="decision" cutoff="10:00" apply={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit filters' }))
    const dialog = screen.getByRole('dialog')
    const apply = screen.getByRole('button', { name: 'Apply filters' })
    apply.focus()
    await userEvent.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(screen.getByRole('button', { name: 'Close filters' })).toHaveFocus()
  })
})
