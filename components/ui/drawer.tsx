"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Drawer = DialogPrimitive.Root

const DrawerTrigger = DialogPrimitive.Trigger

const DrawerPortal = DialogPrimitive.Portal

const DrawerClose = DialogPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DrawerOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DrawerContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "left" | "right"
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, side = "right", ...props }, ref) => {
  // Determine slide direction based on side and RTL
  const isRTL = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
  const actualSide = (side === "right" && !isRTL) || (side === "left" && isRTL) ? "right" : "left"
  
  // Position and animation classes based on side
  const positionClass = actualSide === "right" ? "right-0 top-0" : "left-0 top-0"
  const slideClasses = actualSide === "right"
    ? "translate-x-full data-[state=open]:translate-x-0"
    : "-translate-x-full data-[state=open]:translate-x-0"

  return (
    <DrawerPortal>
      <DrawerOverlay className="z-[100]" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-[100] h-full w-[280px] gap-4 bg-white dark:bg-slate-900 p-0 shadow-lg transition-transform duration-300 ease-in-out",
          positionClass,
          slideClasses,
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [dir=rtl]:right-auto [dir=rtl]:left-4">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DrawerPortal>
  )
})
DrawerContent.displayName = "DrawerContent"

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
}
