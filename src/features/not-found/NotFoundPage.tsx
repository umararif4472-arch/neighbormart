import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import symbol from '@/assets/brand/logo-symbol.svg'

/** 404 with a little personality — the Open Door mark, slightly lost. */
export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <img
        src={symbol}
        alt=""
        aria-hidden
        className="h-20 w-20 -rotate-6 rounded-[1.4rem] shadow-md"
      />
      <h1 className="font-display text-2xl font-extrabold text-bark">
        This page wandered off the block
      </h1>
      <p className="max-w-sm text-sm text-bark-light">
        We looked up and down the street — nothing here. Maybe the address got typo&apos;d, or the
        neighbor moved.
      </p>
      <Link to="/browse">
        <Button>Back to the neighborhood</Button>
      </Link>
    </div>
  )
}
