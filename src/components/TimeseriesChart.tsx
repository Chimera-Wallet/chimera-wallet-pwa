import { useId } from 'react'
import { TIMEFRAMES, type Timeframe } from '../hooks/useHistoricalPrices'

interface TimeseriesChartProps {
  /** `[timestamp, value]` points, oldest first */
  series: [number, number][]
  loading: boolean
  error: string | null
  /** CSS colour variable name, without the `--` */
  colorVar: string
  timeframe: Timeframe
  onTimeframeChange: (timeframe: Timeframe) => void
}

/** Plain-text timeframes above a solid area chart that fades downwards, as in
 * the home and asset page designs. The chart runs edge to edge, so it expects
 * to sit inside <Padded> and cancels its 1rem side padding. */
export default function TimeseriesChart({
  series,
  loading,
  error,
  colorVar,
  timeframe,
  onTimeframeChange,
}: TimeseriesChartProps) {
  const gradientId = `gradient-${useId()}`
  const color = `var(--${colorVar})`

  // Calculate chart dimensions and path
  const chartHeight = 130
  const chartWidth = 320

  const getChartPath = (): string => {
    if (series.length < 2) return ''

    const minValue = Math.min(...series.map((p) => p[1]))
    const maxValue = Math.max(...series.map((p) => p[1]))
    const valueRange = maxValue - minValue || 1

    const points = series.map((p, i) => {
      const x = (i / (series.length - 1)) * chartWidth
      const y = chartHeight - ((p[1] - minValue) / valueRange) * (chartHeight - 10)
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }

  return (
    <div style={{ width: '100%', padding: '0 0 16px 0' }}>
      {/* Timeframe Buttons */}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 24 }}>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            aria-pressed={timeframe === tf}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px 12px',
              fontSize: 14,
              color: timeframe === tf ? 'var(--fg)' : 'var(--neutral-500)',
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ height: chartHeight, position: 'relative', margin: '0 -1rem' }}>
        {loading && series.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--neutral-500)',
              fontSize: 14,
            }}
          >
            Loading chart...
          </div>
        ) : error && series.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--red)',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <svg
              width='100%'
              height={chartHeight}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio='none'
              style={{
                overflow: 'visible',
                opacity: loading ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              {/* Gradient fill under the line */}
              <defs>
                <linearGradient id={gradientId} x1='0%' y1='0%' x2='0%' y2='100%'>
                  <stop offset='0%' stopColor={color} stopOpacity={1} />
                  <stop offset='100%' stopColor={color} stopOpacity={0.15} />
                </linearGradient>
              </defs>

              {/* Fill area */}
              {series.length >= 2 && (
                <path
                  d={`${getChartPath()} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`}
                  fill={`url(#${gradientId})`}
                />
              )}

              {/* Line */}
              <path
                d={getChartPath()}
                fill='none'
                stroke={color}
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
            {loading ? (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'var(--white)',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.5)',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
              >
                Updating...
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
