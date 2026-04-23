import { useState } from 'react'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Text from '../../components/Text'
import Button from '../../components/Button'
import type { AppInfoSlide } from '../../lib/appConfig'

interface AppInfoPageProps {
  appName: string
  slides: AppInfoSlide[]
  onContinue: () => void
  onBack: () => void
}

const Dot = ({ active }: { active: boolean }) => (
  <div
    style={{
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: active ? 'var(--blue-primary, var(--purple))' : 'var(--dark30)',
      transition: 'background-color 0.3s ease',
    }}
  />
)

export default function AppInfoPage({ appName, slides, onContinue, onBack }: AppInfoPageProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const currentSlide = slides[currentIndex]
  const isLastSlide = currentIndex === slides.length - 1

  const handleNext = () => {
    if (isLastSlide) {
      onContinue()
    } else {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  return (
    <>
      <Header text={appName} back={onBack} />
      <Content>
        <Padded>
          <div
            style={{
              height: '100%',
              minHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '2rem',
            }}
          >
            <FlexCol gap='1.5rem' centered>
              {/* App slide image */}
              <div
                style={{
                  width: '200px',
                  height: '200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={currentSlide.image}
                  alt={currentSlide.title}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>

              <FlexCol gap='0.75rem' centered>
                <Text bold large centered>
                  {currentSlide.title}
                </Text>
                <Text centered wrap>
                  {currentSlide.description}
                </Text>
              </FlexCol>
            </FlexCol>

            <FlexCol gap='1rem'>
              {/* Pagination dots */}
              {slides.length > 1 && (
                <FlexRow centered gap='0.5rem'>
                  {slides.map((slide, index) => (
                    <Dot key={slide.title} active={index === currentIndex} />
                  ))}
                </FlexRow>
              )}

              <FlexRow gap='1rem'>
                {currentIndex > 0 && <Button onClick={handlePrev} label='Back' secondary />}
                <Button onClick={handleNext} label={isLastSlide ? 'Continue' : 'Next'} />
              </FlexRow>
            </FlexCol>
          </div>
        </Padded>
      </Content>
    </>
  )
}
