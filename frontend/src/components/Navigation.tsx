import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { NavLink } from 'react-router-dom'
import { ArrowUpRight, Database, Menu, Wind, X } from 'lucide-react'
import { Badge } from './ui'
import { pages } from '../lib/navigation'


function SidebarContent({ search, navigate, mobile = false }: { search: string; navigate?: () => void; mobile?: boolean }) {
  return <div className="sidebar-inner">
    <div className="sidebar-brand-row"><NavLink className="brand" onClick={navigate} to={{ pathname: '/', search }}><span className="brand-mark"><Wind size={26} strokeWidth={1.8} /></span><span>WindScope<span className="brand-period">.</span></span></NavLink>
      {mobile && <Dialog.Close asChild><button className="icon-button drawer-close" aria-label="Close navigation"><X size={20} /></button></Dialog.Close>}</div>
    <div className="workspace-card"><span className="workspace-icon">GB</span><div><strong>National wind</strong><span>Great Britain · Elexon</span></div></div>
    <p className="nav-label">WORKSPACE</p>
    <nav aria-label="Workspace">{pages.map(({ path, label, icon: Icon }) => <NavLink end={path === '/'} key={path} onClick={navigate}
      to={{ pathname: path, search }} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <span className="nav-icon"><Icon size={19} strokeWidth={1.7} /></span><span className="nav-text">{label}</span><span className="nav-active-dot" />
    </NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="source-card"><span className="source-label"><Database size={15} />POWERED BY ELEXON</span>
      <p>One source.<br />A clearer perspective.</p><span>WINDFOR + FUELHH / WIND</span>
      <a href="https://bmrs.elexon.co.uk/wind-generation" target="_blank" rel="noreferrer">View source <ArrowUpRight size={14} /></a></div>
      <div className="sidebar-foot"><span className="pilot-avatar">W</span><div><strong>Pilot workspace</strong><span>Historical analysis</span></div><Badge>v1</Badge></div>
    </div>
  </div>
}

export function DesktopSidebar({ search }: { search: string }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    // Also contain wheel events when the sidebar is too short to overflow.
    // React's delegated wheel listener is passive, so use a native listener.
    const containScroll = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return
      const atTop = element.scrollTop <= 0
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault()
    }
    element.addEventListener('wheel', containScroll, { passive: false })
    return () => element.removeEventListener('wheel', containScroll)
  }, [])
  return <aside ref={ref} className="sidebar desktop-sidebar" aria-label="Main navigation"><SidebarContent search={search} /></aside>
}

export function MobileNavigation({ search }: { search: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 901px)')
    const closeOnDesktop = () => { if (query.matches) setOpen(false) }
    query.addEventListener('change', closeOnDesktop)
    return () => query.removeEventListener('change', closeOnDesktop)
  }, [])
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button className="icon-button mobile-menu-button" aria-label="Open navigation"><Menu size={21} /></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay drawer-overlay" /><Dialog.Content asChild aria-describedby={undefined}>
      <aside className="sidebar mobile-drawer"><Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
        <SidebarContent mobile search={search} navigate={() => setOpen(false)} /></aside>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
}
