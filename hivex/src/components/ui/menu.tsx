'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'

import { cn } from '@/lib/utils/cn'

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger
export const MenuGroup = DropdownMenu.Group

export const MenuContent = forwardRef<
  ElementRef<typeof DropdownMenu.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(function MenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-52 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-pop',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
})

export const MenuItem = forwardRef<
  ElementRef<typeof DropdownMenu.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { tone?: 'default' | 'destructive' }
>(function MenuItem({ className, tone = 'default', ...props }, ref) {
  return (
    <DropdownMenu.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] outline-none',
        'transition-colors data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        tone === 'destructive' && 'text-destructive data-[highlighted]:bg-destructive-soft',
        className,
      )}
      {...props}
    />
  )
})

export const MenuCheckboxItem = forwardRef<
  ElementRef<typeof DropdownMenu.CheckboxItem>,
  ComponentPropsWithoutRef<typeof DropdownMenu.CheckboxItem>
>(function MenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenu.CheckboxItem
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2.5 rounded-md py-2 pl-8 pr-2.5 text-[13px] outline-none',
        'transition-colors data-[highlighted]:bg-muted',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-3.5 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Check className="size-3.5 text-primary" />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  )
})

export function MenuLabel({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn('px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground', className)}
      {...props}
    />
  )
}

export function MenuSeparator({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
