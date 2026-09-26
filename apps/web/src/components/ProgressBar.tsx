import './ProgressBar.css'

/** A thin played-share bar; `fraction` is 0..1. Renders nothing at 0. */
export function ProgressBar({ fraction, className = '' }: { fraction: number; className?: string }) {
  if (fraction <= 0) return null
  return (
    <div className={`go-progress ${className}`.trim()} aria-hidden="true">
      <div className="go-progress_fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
    </div>
  )
}
