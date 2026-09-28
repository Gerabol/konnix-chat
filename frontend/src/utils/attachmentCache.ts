class AttachmentBlobCache {
  private readonly maxCapacity: number
  private readonly cache = new Map<string, string>()

  constructor(maxCapacity = 100) {
    this.maxCapacity = maxCapacity
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  set(key: string, url: string): void {
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)
      if (existing && existing !== url && existing.startsWith('blob:')) {
        URL.revokeObjectURL(existing)
      }
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxCapacity) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        const oldestUrl = this.cache.get(oldestKey)
        if (oldestUrl && oldestUrl.startsWith('blob:')) {
          URL.revokeObjectURL(oldestUrl)
        }
        this.cache.delete(oldestKey)
      }
    }
    this.cache.set(key, url)
  }

  clear(): void {
    for (const url of this.cache.values()) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    }
    this.cache.clear()
  }
}

export const attachmentBlobCache = new AttachmentBlobCache(100)
