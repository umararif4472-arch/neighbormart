import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Last-resort render guard: a crash in any feature tree degrades to a
 * friendly panel instead of a white screen. The boundary resets on route
 * change (children change → state resets), so users can recover by
 * navigating away and back.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Prototype: surface in console; a real backend would report it.
    console.error('[NeighborMart] render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="mx-auto my-16 flex max-w-md flex-col items-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <span aria-hidden className="text-4xl">
            🛠️
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-bark">
              Something wobbled on this page
            </h2>
            <p className="mt-1 text-sm text-bark-light">
              The rest of the app is fine — this page hit an unexpected snag.
            </p>
          </div>
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
