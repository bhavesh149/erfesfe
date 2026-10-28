import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Component } from 'react'
import type { ReactNode } from 'react'
import './index.css'
import App from './App'
import { ApiError } from './services/api'
import { ThemeProvider } from './styles/ThemeProvider'

const queryClient = new QueryClient({ defaultOptions: { queries: {
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status === 422),
} } })

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div className="fatal-error" role="alert"><h1>Something went wrong</h1>
      <p>The dashboard couldn’t be displayed. Reload to try again.</p><button onClick={() => window.location.reload()}>Reload dashboard</button></div> : this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary><ThemeProvider><QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></ThemeProvider></ErrorBoundary></StrictMode>,
)
