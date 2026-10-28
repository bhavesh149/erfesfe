import { useId, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import { CalendarDays, Check, ChevronDown, ChevronUp, Clock3, Info, SlidersHorizontal, X } from 'lucide-react'
import type { Basis } from '../services/api'

function TimeColumn({ label, value, count, onChange }: {
  label: string; value: string; count: number; onChange: (value: string) => void
}) {
  return <Select.Root value={value} onValueChange={onChange}>
    <Select.Trigger className="time-select" aria-label={label}><Select.Value /><Select.Icon><ChevronDown size={16} /></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content className="select-menu" position="popper" sideOffset={6} collisionPadding={12}>
      <Select.ScrollUpButton className="select-scroll"><ChevronUp size={15} /></Select.ScrollUpButton>
      <Select.Viewport className="select-viewport">{Array.from({ length: count }, (_, index) => {
        const item = String(index).padStart(2, '0')
        return <Select.Item className="select-option" key={item} value={item}>
          <Select.ItemText>{item}</Select.ItemText><Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
        </Select.Item>
      })}</Select.Viewport>
      <Select.ScrollDownButton className="select-scroll"><ChevronDown size={15} /></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>
}

export default function Filters({ basis, cutoff, apply }: {
  basis: Basis; cutoff: string; apply: (basis: Basis, cutoff: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draftBasis, setDraftBasis] = useState(basis)
  const [draftCutoff, setDraftCutoff] = useState(cutoff)
  const groupId = useId()
  const [hour, minute] = draftCutoff.split(':')
  function changeOpen(next: boolean) {
    if (next) { setDraftBasis(basis); setDraftCutoff(cutoff) }
    setOpen(next)
  }
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <section className="filter-bar" aria-label="Applied analysis filters">
      <div className="filter-summary"><CalendarDays size={18} /><div><span>ANALYSIS PERIOD</span><strong>January 2026</strong></div><span className="fixed-period">FIXED</span></div>
      <div className="filter-summary"><SlidersHorizontal size={17} /><div><span>DATE BASIS</span><strong>{basis === 'decision' ? 'Decision dates' : 'Delivery dates'}</strong></div></div>
      <div className="filter-summary"><Clock3 size={18} /><div><span>ASSUMED CUTOFF · UK</span><strong>{cutoff}<small>previous day</small></strong></div></div>
      <Dialog.Trigger asChild><button className="button button-secondary filter-edit"><SlidersHorizontal size={15} />Edit filters</button></Dialog.Trigger>
    </section>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="filter-dialog" aria-describedby={`${groupId}-description`}>
      <div className="dialog-header"><span className="dialog-header-icon"><SlidersHorizontal size={21} /></span><div>
        <Dialog.Title>Analysis filters</Dialog.Title><Dialog.Description id={`${groupId}-description`}>Choose which dates and forecast publications to evaluate.</Dialog.Description>
      </div><Dialog.Close asChild><button className="icon-button" aria-label="Close filters"><X size={18} /></button></Dialog.Close></div>
      <form onSubmit={event => { event.preventDefault(); apply(draftBasis, draftCutoff); setOpen(false) }}>
        <div className="dialog-body">
          <div className="fixed-month"><span className="fixed-month-icon"><CalendarDays size={20} /></span><div><span className="field-eyebrow">ANALYSIS PERIOD</span><strong>January 2026</strong><p>This pilot uses the January historical archive.</p></div><span className="badge">Fixed period</span></div>
          <fieldset className="basis-fieldset"><legend>Date basis</legend><p className="field-help">Anchor the analysis to purchasing decisions or delivery dates.</p>
            <div className="basis-options">{([
              ['decision', 'Decision dates', 'Decisions on 1–31 Jan', 'Delivery: 2 Jan – 1 Feb'],
              ['delivery', 'Delivery dates', 'Delivery on 1–31 Jan', 'Decisions: 31 Dec – 30 Jan'],
            ] as const).map(([value, title, subtitle, detail]) => <label className={`basis-option ${draftBasis === value ? 'selected' : ''}`} key={value}>
              <input type="radio" name={`${groupId}-basis`} value={value} checked={draftBasis === value} onChange={() => setDraftBasis(value)} />
              <span><strong>{title}</strong><span>{subtitle}</span><small>{detail}</small></span>
            </label>)}</div>
          </fieldset>
          <div className="cutoff-heading"><div><h3>Previous-day cutoff</h3><p className="field-help">Use the latest forecast published at or before this time.</p></div><span className="timezone-tag">UK time · 24h</span></div>
          <div className="time-picker"><Clock3 size={22} className="time-picker-icon" /><div className="time-column"><span>HOUR</span><TimeColumn label="Cutoff hour" value={hour} count={24} onChange={value => setDraftCutoff(`${value}:${minute}`)} /></div><span className="time-colon">:</span>
            <div className="time-column"><span>MINUTE</span><TimeColumn label="Cutoff minute" value={minute} count={60} onChange={value => setDraftCutoff(`${hour}:${value}`)} /></div>
            <div className="time-presets"><span>QUICK SELECT</span><div>{['09:00', '10:00', '12:00'].map(value => <button type="button" key={value} aria-pressed={draftCutoff === value} onClick={() => setDraftCutoff(value)}>{value}</button>)}</div></div>
          </div>
          <div className="cutoff-explainer"><Info size={17} /><p>This is an <strong>analysis assumption</strong>, not an auction deadline. The cutoff is on the day before delivery, in Europe/London time. January uses GMT.</p></div>
        </div>
        <div className="dialog-footer"><button className="text-button reset-filters" type="button" onClick={() => { setDraftBasis('decision'); setDraftCutoff('10:00') }}>Reset defaults</button><div>
          <Dialog.Close asChild><button className="button button-secondary" type="button">Cancel</button></Dialog.Close><button className="button button-primary" type="submit"><Check size={16} />Apply filters</button>
        </div></div>
      </form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
}
