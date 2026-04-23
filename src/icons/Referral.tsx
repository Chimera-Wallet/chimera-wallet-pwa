export default function ReferralIcon({ big = false }: { big?: boolean }) {
  const size = big ? 78 : 55
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width={size}
      height={size}
      viewBox='0 0 78 78'
      fill='none'
      role='img'
      aria-label='Referral icon'
    >
      <circle cx='39' cy='39' r='37.5' fill='#10B981' stroke='#34D399' strokeWidth='3' />
      {/* Center person */}
      <circle cx='39' cy='30' r='8' fill='white' fillOpacity='0.9' />
      <path
        d='M27 48C27 41.3726 32.3726 36 39 36C45.6274 36 51 41.3726 51 48V52H27V48Z'
        fill='white'
        fillOpacity='0.9'
      />
      {/* Left person (smaller) */}
      <circle cx='22' cy='42' r='5' fill='white' fillOpacity='0.6' />
      <path
        d='M14 54C14 50.134 17.134 47 21 47H23C26.866 47 30 50.134 30 54V56H14V54Z'
        fill='white'
        fillOpacity='0.6'
      />
      {/* Right person (smaller) */}
      <circle cx='56' cy='42' r='5' fill='white' fillOpacity='0.6' />
      <path
        d='M48 54C48 50.134 51.134 47 55 47H57C60.866 47 64 50.134 64 54V56H48V54Z'
        fill='white'
        fillOpacity='0.6'
      />
      {/* Connection lines */}
      <path d='M31 36L24 42M47 36L54 42' stroke='white' strokeWidth='2' strokeLinecap='round' strokeOpacity='0.5' />
    </svg>
  )
}
