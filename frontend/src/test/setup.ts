import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({
  matches: false, media: '', onchange: null,
  addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
})) })

Element.prototype.scrollIntoView = vi.fn()
Element.prototype.hasPointerCapture = vi.fn(() => false)
Element.prototype.setPointerCapture = vi.fn()
Element.prototype.releasePointerCapture = vi.fn()

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
