type SunGlyphProps = {
  x: number
  y: number
  radius?: number
  /** "solid" is the moment you picked, "outline" its twin later in the year. */
  variant?: "solid" | "outline"
  className?: string
}

/**
 * A tiny sun drawn straight into the chart's coordinate system. Colour comes
 * from `currentColor`, so the parent decides with a text-* class.
 */
export function SunGlyph({
  x,
  y,
  radius = 6,
  variant = "solid",
  className,
}: SunGlyphProps) {
  const rays = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4
    const inner = radius + 2.5
    const outer = radius + 5.5
    return {
      x1: x + Math.cos(angle) * inner,
      y1: y + Math.sin(angle) * inner,
      x2: x + Math.cos(angle) * outer,
      y2: y + Math.sin(angle) * outer,
    }
  })

  return (
    <g className={className}>
      {rays.map((ray, index) => (
        <line
          key={index}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={variant === "solid" ? 0.9 : 0.55}
        />
      ))}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={variant === "solid" ? "currentColor" : "var(--color-card)"}
        stroke="currentColor"
        strokeWidth={variant === "solid" ? 0 : 2}
      />
    </g>
  )
}
