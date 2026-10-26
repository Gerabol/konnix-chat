import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../../api'
export { initials } from '../../utils/room'

const avatarCache = new Map<string, string>()

export function AvatarImage({
  path,
  className,
  fallback,
  alt,
}: {
  path: string | null
  className: string
  fallback?: ReactNode
  alt?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }
    const cached = avatarCache.get(path)
    if (cached) {
      setUrl(cached)
      return
    }
    let active = true
    api
      .fetchBlob(path)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        avatarCache.set(path, objectUrl)
        if (active) setUrl(objectUrl)
      })
      .catch(() => {
        if (active) setUrl(null)
      })
    return () => {
      active = false
    }
  }, [path])

  if (!path || !url) {
    return fallback ?? null
  }
  return <img src={url} alt={alt ?? ''} className={className} />
}

export default AvatarImage
