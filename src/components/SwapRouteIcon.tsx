import { getAssetSymbolByAssetId, type AssetSymbol } from '../lib/assets'
import AssetIcon from '../icons/AssetIcon'

interface SwapRouteAsset {
  assetId?: string
  ticker?: string
}

/** Two overlapping asset icons — the swap's route at a glance, the way a
 * single-asset row already leads with its own icon. Falls back to a plain
 * ticker-initial disc for an asset id this build doesn't have a logo for
 * (e.g. a restored swap against an asset that has since been disabled). */
export default function SwapRouteIcon({
  from,
  to,
  size = 32,
}: {
  from: SwapRouteAsset
  to: SwapRouteAsset
  size?: number
}) {
  const frontSize = size
  const backSize = Math.round(size * 0.82)
  return (
    <div style={{ position: 'relative', width: size + Math.round(size * 0.5), height: size, flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: 0, top: size - backSize }}>
        <RouteAsset asset={from} size={backSize} />
      </div>
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          borderRadius: '50%',
          boxShadow: '0 0 0 2px var(--surface, var(--dark10))',
        }}
      >
        <RouteAsset asset={to} size={frontSize} />
      </div>
    </div>
  )
}

function RouteAsset({ asset, size }: { asset: SwapRouteAsset; size: number }) {
  const symbol = asset.assetId === 'btc' ? 'BTC' : asset.assetId ? getAssetSymbolByAssetId(asset.assetId) : undefined
  if (symbol) return <AssetIcon symbol={symbol as AssetSymbol} size={size} />
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--dark10)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.4),
        fontWeight: 700,
        color: 'var(--white)',
      }}
    >
      {(asset.ticker ?? '?').slice(0, 1).toUpperCase()}
    </div>
  )
}
