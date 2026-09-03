import * as React from "react"

import { cn } from "@/lib/utils"

type SliderProps = Omit<React.ComponentProps<"input">, "type" | "onChange"> & {
  onValueChange: (value: number) => void
}

/**
 * A native range input with the accent colour swapped for the sun. Native
 * keeps keyboard and touch behaviour for free.
 */
function Slider({ className, onValueChange, ...props }: SliderProps) {
  return (
    <input
      type="range"
      data-slot="slider"
      className={cn(
        "h-5 w-full cursor-pointer accent-sun outline-none",
        "rounded-full focus-visible:ring-3 focus-visible:ring-ring/30",
        className
      )}
      onChange={(event) => onValueChange(Number(event.target.value))}
      {...props}
    />
  )
}

export { Slider }
