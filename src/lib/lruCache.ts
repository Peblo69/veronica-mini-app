// Simple LRU Cache implementation
export class LRUCache<K, V> {
  private cache: Map<K, V>
  private maxSize: number

  constructor(maxSize: number) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined
    }
    // Move to end (most recently used)
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    // If key exists, delete it first (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // If at capacity, delete oldest (first item)
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, value)
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

// Specialized LRU cache for nested maps (messageId -> lang -> translation)
export class TranslationLRUCache {
  private cache: Map<string, Map<string, string>>
  private accessOrder: string[] // Track access order for LRU eviction
  private maxMessages: number

  constructor(maxMessages: number = 500) {
    this.cache = new Map()
    this.accessOrder = []
    this.maxMessages = maxMessages
  }

  get(messageId: string, lang: string): string | undefined {
    const langMap = this.cache.get(messageId)
    if (!langMap) return undefined

    // Move to end of access order (most recently used)
    const idx = this.accessOrder.indexOf(messageId)
    if (idx > -1) {
      this.accessOrder.splice(idx, 1)
      this.accessOrder.push(messageId)
    }

    return langMap.get(lang)
  }

  set(messageId: string, lang: string, translation: string): void {
    // If message doesn't exist in cache
    if (!this.cache.has(messageId)) {
      // Evict oldest if at capacity
      while (this.cache.size >= this.maxMessages && this.accessOrder.length > 0) {
        const oldest = this.accessOrder.shift()
        if (oldest) {
          this.cache.delete(oldest)
        }
      }
      this.cache.set(messageId, new Map())
      this.accessOrder.push(messageId)
    } else {
      // Move to end of access order
      const idx = this.accessOrder.indexOf(messageId)
      if (idx > -1) {
        this.accessOrder.splice(idx, 1)
        this.accessOrder.push(messageId)
      }
    }

    this.cache.get(messageId)!.set(lang, translation)
  }

  has(messageId: string, lang?: string): boolean {
    if (!this.cache.has(messageId)) return false
    if (lang === undefined) return true
    return this.cache.get(messageId)!.has(lang)
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder = []
  }

  get size(): number {
    return this.cache.size
  }
}
