export const APPROVED_ICONS_KEY = 'approvedAssetIcons'

export class AssetIconApprovalManager {
  private approvedIds: Set<string>
  private verifiedIds: Set<string>
  private storageKey: string

  constructor(storageKey = APPROVED_ICONS_KEY) {
    this.storageKey = storageKey
    this.approvedIds = this.load()
    this.verifiedIds = new Set()
  }

  approve(assetId: string): void {
    this.approvedIds.add(assetId)
    this.save()
  }

  revoke(assetId: string): void {
    this.approvedIds.delete(assetId)
    this.save()
  }

  isApproved(assetId: string): boolean {
    return this.approvedIds.has(assetId) || this.isVerified(assetId)
  }

  setVerifiedAssets(ids: string[]): void {
    // Registry lists and env ids may differ in hex case; compare lowercased.
    this.verifiedIds = new Set(ids.map((id) => id.toLowerCase()))
  }

  isVerified(assetId: string): boolean {
    return this.verifiedIds.has(assetId.toLowerCase())
  }

  private load(): Set<string> {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return new Set()
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return new Set(parsed)
      return new Set()
    } catch {
      return new Set()
    }
  }

  private save(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify([...this.approvedIds]))
    } catch {
      // localStorage quota exceeded — in-memory state remains correct
    }
  }
}
