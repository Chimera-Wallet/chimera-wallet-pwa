import React, { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'

interface BannerCarouselProps {
  children: React.ReactNode[]
}

/**
 * Horizontal, swipeable carousel for the wallet home promo banners.
 * Slides peek the next card and snap into place; a dot indicator shows position.
 */
export default function BannerCarousel({ children }: BannerCarouselProps) {
  const slides = React.Children.toArray(children).filter(Boolean)
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps' })
  const [selectedIndex, setSelectedIndex] = useState(0)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi, onSelect])

  // Single banner: render directly without carousel chrome
  if (slides.length <= 1) {
    return <>{slides}</>
  }

  return (
    <div>
      {/* Top padding leaves room for protruding card art (e.g. the staking coins) */}
      <div ref={emblaRef} style={{ overflow: 'hidden', paddingTop: 32, paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          {slides.map((slide) => (
            <div
              key={(slide as React.ReactElement).key ?? undefined}
              style={{ flex: '0 0 92%', minWidth: 0, display: 'flex' }}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
        {slides.map((slide, i) => (
          <button
            key={(slide as React.ReactElement).key ?? undefined}
            onClick={() => emblaApi?.scrollTo(i)}
            aria-label={`Go to banner ${i + 1}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              backgroundColor: i === selectedIndex ? 'var(--fg)' : 'var(--neutral-300)',
              transition: 'background-color 0.2s',
            }}
          />
        ))}
      </div>
    </div>
  )
}
