"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  loading = false,
  disabled,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
  loading?: boolean
}) {
  const root = (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      disabled={loading || disabled}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  )

  if (!loading) return root

  return (
    <span data-slot="switch-wrapper" className="relative inline-flex items-center">
      {root}
      <Loader2
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-foreground/70",
          size === "sm" ? "size-2.5" : "size-3"
        )}
      />
    </span>
  )
}

export { Switch }
