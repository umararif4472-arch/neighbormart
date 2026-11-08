import { useEffect } from 'react'

interface PageMeta {
  /** Page title — "NeighborMart" is appended unless already present. */
  title: string
  description?: string
  /** Absolute or root-relative image URL for Open Graph. */
  image?: string
}

const DEFAULT_DESCRIPTION =
  'NeighborMart is your local marketplace: borrow, rent, buy, or sell items, vehicles, properties, and sports arenas near you.'

function setMeta(selector: string, attr: 'content', value: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector)
  if (el) el.setAttribute(attr, value)
}

/**
 * Per-page SEO (Phase 8): sets document.title + description + OG tags
 * for the current page. Static defaults live in index.html; listing
 * pages pass their own title/photo so shared links preview properly.
 */
export function usePageMeta({ title, description, image }: PageMeta) {
  useEffect(() => {
    const fullTitle = title.includes('NeighborMart') ? title : `${title} — NeighborMart`
    document.title = fullTitle
    setMeta('meta[name="description"]', 'content', description ?? DEFAULT_DESCRIPTION)
    setMeta('meta[property="og:title"]', 'content', fullTitle)
    setMeta('meta[property="og:description"]', 'content', description ?? DEFAULT_DESCRIPTION)
    if (image) setMeta('meta[property="og:image"]', 'content', image)
  }, [title, description, image])
}
