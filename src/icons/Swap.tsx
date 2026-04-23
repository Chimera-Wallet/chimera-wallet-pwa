export default function SwapIcon({ big = false }: { big?: boolean }) {
  const size = big ? 55 : 24

  if (big) {
    return (
      <svg
        xmlns='http://www.w3.org/2000/svg'
        width={size}
        height={size}
        viewBox='0 0 78 78'
        fill='none'
        role='img'
        aria-label='Swap icon'
      >
        <defs>
          <linearGradient id='swapGradient1' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor='#6366F1' />
            <stop offset='100%' stopColor='#8B5CF6' />
          </linearGradient>
          <linearGradient id='swapGradient2' x1='100%' y1='0%' x2='0%' y2='100%'>
            <stop offset='0%' stopColor='#F59E0B' />
            <stop offset='100%' stopColor='#EF4444' />
          </linearGradient>
        </defs>
        <circle cx='39' cy='39' r='37.5' stroke='url(#swapGradient1)' strokeWidth='3' fill='#1a1a2e' />
        <path
          d='M20 28H50L44 22'
          stroke='url(#swapGradient1)'
          strokeWidth='4'
          strokeLinecap='round'
          strokeLinejoin='round'
          fill='none'
        />
        <path
          d='M50 28L44 34'
          stroke='url(#swapGradient1)'
          strokeWidth='4'
          strokeLinecap='round'
          strokeLinejoin='round'
          fill='none'
        />
        <path
          d='M58 50H28L34 44'
          stroke='url(#swapGradient2)'
          strokeWidth='4'
          strokeLinecap='round'
          strokeLinejoin='round'
          fill='none'
        />
        <path
          d='M28 50L34 56'
          stroke='url(#swapGradient2)'
          strokeWidth='4'
          strokeLinecap='round'
          strokeLinejoin='round'
          fill='none'
        />
      </svg>
    )
  }

  return (
    <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 25' fill='none'>
      <path
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        transform='translate(3 3)'
        d='M6 9L1.6 9C1.03995 9 0.75992 9 0.54601002 9.1090002C0.35784999 9.2048998 0.20487 9.3577995 0.10899 9.5459995C0 9.7599001 0 10.0399 0 10.6L0 16.4C0 16.9601 0 17.240101 0.10899 17.454C0.20487 17.6422 0.35784999 17.795099 0.54601002 17.891001C0.75992 18 1.03995 18 1.6 18L6 18M6 18L12 18M6 18L6 5.5999999C6 5.0399499 6 4.7599201 6.1089902 4.54601C6.2048702 4.3578501 6.3578501 4.2048702 6.54601 4.1089902C6.7599201 4 7.0398998 4 7.5999999 4L10.4 4C10.9601 4 11.2401 4 11.454 4.1089902C11.6422 4.2048702 11.7951 4.3578501 11.891 4.54601C12 4.7599201 12 5.0399499 12 5.5999999L12 18M12 18L16.4 18C16.9601 18 17.240101 18 17.454 17.891001C17.6422 17.795099 17.795099 17.6422 17.891001 17.454C18 17.240101 18 16.9601 18 16.4L18 1.6C18 1.03995 18 0.75992 17.891001 0.54601002C17.795099 0.35784999 17.6422 0.20487 17.454 0.10899C17.240101 0 16.9601 0 16.4 0L13.6 0C13.0399 0 12.7599 0 12.546 0.10899C12.3578 0.20487 12.2049 0.35784999 12.109 0.54601002C12 0.75992 12 1.03995 12 1.6L12 5'
        fillRule='evenodd'
      />
    </svg>
  )
}

export function SwapSuccessIcon() {
  return (
    <svg width='42' height='43' viewBox='0 0 42 43' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <rect y='0.5' width='40' height='40' rx='20' fill='var(--white)' fillOpacity='0.1' />
      <path
        d='M21.875 12.375L26.25 16.75L21.875 21.125'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M25.5809 16.75H13.75'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M18.125 28.625L13.75 24.25L18.125 19.875'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M14.4531 24.25H26.25'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <rect x='25.4167' y='26.4167' width='15.1667' height='15.1667' rx='7.58333' fill='#60B18A' />
      <rect x='25.4167' y='26.4167' width='15.1667' height='15.1667' rx='7.58333' />
      <path
        d='M36.8081 32.2689L32.1414 36.9356C32.1007 36.9764 32.0524 37.0087 31.9993 37.0308C31.9461 37.0529 31.8891 37.0643 31.8315 37.0643C31.7739 37.0643 31.7169 37.0529 31.6637 37.0308C31.6105 37.0087 31.5622 36.9764 31.5216 36.9356L29.4799 34.8939C29.4392 34.8532 29.4069 34.8049 29.3849 34.7517C29.3629 34.6986 29.3516 34.6416 29.3516 34.584C29.3516 34.5265 29.3629 34.4695 29.3849 34.4163C29.4069 34.3631 29.4392 34.3148 29.4799 34.2741C29.5206 34.2334 29.5689 34.2011 29.6221 34.1791C29.6753 34.1571 29.7323 34.1458 29.7898 34.1458C29.8474 34.1458 29.9044 34.1571 29.9575 34.1791C30.0107 34.2011 30.059 34.2334 30.0997 34.2741L31.8319 36.0063L36.189 31.6498C36.2712 31.5677 36.3826 31.5215 36.4989 31.5215C36.6151 31.5215 36.7266 31.5677 36.8088 31.6498C36.891 31.732 36.9371 31.8435 36.9371 31.9597C36.9371 32.076 36.891 32.1874 36.8088 32.2696L36.8081 32.2689Z'
        fill='#010101'
      />
    </svg>
  )
}

export function SwapPendingIcon() {
  return (
    <svg width='42' height='43' viewBox='0 0 42 43' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <rect y='0.5' width='40' height='40' rx='20' fill='var(--white)' fillOpacity='0.1' />
      <path
        d='M21.875 12.375L26.25 16.75L21.875 21.125'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M25.5809 16.75H13.75'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M18.125 28.625L13.75 24.25L18.125 19.875'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M14.4531 24.25H26.25'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <rect x='25.4167' y='26.4167' width='15.1667' height='15.1667' rx='7.58333' fill='#E69B39' />
      <rect x='25.4167' y='26.4167' width='15.1667' height='15.1667' rx='7.58333' />
      <path
        d='M35.625 32.0917V30.7923C35.625 30.6376 35.5635 30.4892 35.4541 30.3798C35.3447 30.2704 35.1964 30.209 35.0417 30.209H30.9583C30.8036 30.209 30.6553 30.2704 30.5459 30.3798C30.4365 30.4892 30.375 30.6376 30.375 30.7923V32.1048C30.3752 32.1953 30.3964 32.2846 30.4369 32.3656C30.4773 32.4465 30.536 32.517 30.6083 32.5715L32.514 34.0007L30.6083 35.4298C30.536 35.4843 30.4773 35.5548 30.4369 35.6357C30.3964 35.7167 30.3752 35.806 30.375 35.8965V37.209C30.375 37.3637 30.4365 37.5121 30.5459 37.6215C30.6553 37.7309 30.8036 37.7923 30.9583 37.7923H35.0417C35.1964 37.7923 35.3447 37.7309 35.4541 37.6215C35.5635 37.5121 35.625 37.3637 35.625 37.209V35.9096C35.6248 35.8194 35.6038 35.7305 35.5636 35.6498C35.5235 35.569 35.4653 35.4986 35.3935 35.444L33.4838 34.0007L35.3935 32.5569C35.4653 32.5024 35.5236 32.4321 35.5637 32.3514C35.6039 32.2707 35.6248 32.1818 35.625 32.0917ZM35.0417 37.209H30.9583V35.8965L33 34.3652L35.0417 35.9092V37.209ZM35.0417 32.0917L33 33.6361L30.9583 32.1048V30.7923H35.0417V32.0917Z'
        fill='black'
      />
    </svg>
  )
}

export function SwapFailedIcon() {
  return (
    <svg width='42' height='43' viewBox='0 0 42 43' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <rect y='0.5' width='40' height='40' rx='20' fill='var(--white)' fillOpacity='0.1' />
      <path
        d='M21.875 12.375L26.25 16.75L21.875 21.125'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M25.5809 16.75H13.75'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M18.125 28.625L13.75 24.25L18.125 19.875'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M14.4531 24.25H26.25'
        stroke='var(--white)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <rect x='25.4167' y='26.4167' width='15.1667' height='15.1667' rx='7.58333' fill='#E04D4D' />
      <rect x='25.4167' y='26.4167' width='15.1667' height='15.1667' rx='7.58333' />
      <path
        d='M30.75 31.75L35.25 36.25M35.25 31.75L30.75 36.25'
        stroke='black'
        strokeWidth='0.8'
        strokeLinecap='round'
      />
    </svg>
  )
}
