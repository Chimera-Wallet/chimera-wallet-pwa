import * as React from 'react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role='navigation'
      aria-label='pagination'
      data-slot='pagination'
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul data-slot='pagination-content' className={cn('flex items-center gap-0.5', className)} {...props} />
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot='pagination-item' {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
  React.ComponentProps<'a'>

function PaginationLink({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) {
  return (
    <Button
      variant={isActive ? 'outline' : 'ghost'}
      size={size}
      className={cn(className)}
      nativeButton={false}
      render={
        <a aria-current={isActive ? 'page' : undefined} data-slot='pagination-link' data-active={isActive} {...props} />
      }
    />
  )
}

function PaginationPrevious({
  className,
  text = 'components.pagination.previous',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  const {t} = useTranslation()
  return (
    <PaginationLink aria-label={t('components.pagination.goPrev')} size='default' className={cn('pl-1.5!', className)} {...props}>
      <ChevronLeftIcon data-icon='inline-start' />
      <span className='hidden sm:block'>{t(text)}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = 'components.pagination.next',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  const {t} = useTranslation()
  return (
    <PaginationLink aria-label={t('components.pagination.goNext')} size='default' className={cn('pr-1.5!', className)} {...props}>
      <span className='hidden sm:block'>{t(text)}</span>
      <ChevronRightIcon data-icon='inline-end' />
    </PaginationLink>
  )
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  const {t} = useTranslation()
  return (
    <span
      aria-hidden
      data-slot='pagination-ellipsis'
      className={cn("flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className='sr-only'>{t('components.pagination.more')}</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
