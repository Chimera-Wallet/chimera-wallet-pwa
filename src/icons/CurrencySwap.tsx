export default function CurrencySwapIcon() {
  return (
    <svg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'>
      {/* Top circular arrow (clockwise) */}
      <path
        d='M14 6C12.8 4.8 11.2 4 9.5 4C6.5 4 4 6.5 4 9.5'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        fill='none'
      />
      <path
        d='M12 6L14 6L14 8'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        fill='none'
      />

      {/* Bottom circular arrow (counterclockwise) */}
      <path
        d='M6 14C7.2 15.2 8.8 16 10.5 16C13.5 16 16 13.5 16 10.5'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        fill='none'
      />
      <path
        d='M8 14L6 14L6 12'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        fill='none'
      />
    </svg>
  )
}
