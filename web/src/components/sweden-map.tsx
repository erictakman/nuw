import * as React from "react"

import { solarPosition, sunAngles, type Coordinates } from "@/lib/solar"
import {
  cssColor,
  fieldColor,
  irradianceColor,
  REFRACTION_COLOR,
} from "@/lib/sun-shading"
import {
  buildLightGrid,
  paintLightField,
  type LightGrid,
} from "@/lib/light-field"
import { createProjection } from "@/lib/map-projection"
import { isoElevationLevels, isoElevationLine } from "@/lib/iso-elevation"
import { SWEDEN_RINGS } from "@/lib/sweden"
import { SWEDISH_PLACES } from "@/lib/places"

/** Logical drawing units; the element scales to whatever width it is given. */
const WIDTH = 308
const HEIGHT = 740

/**
 * Resolution of the light field. The field is smooth, so a coarse grid
 * upscaled bilinearly looks the same as a per-pixel one and costs a twentieth
 * as much to compute.
 */
const FIELD_WIDTH = 154
const FIELD_HEIGHT = 370

const DEG = Math.PI / 180

/** Ray casting: a point is on land if it is inside any one of the rings. */
function onLand(rings: Array<Array<[number, number]>>, x: number, y: number) {
  for (const ring of rings) {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }
    if (inside) {
      return true
    }
  }
  return false
}

type SwedenMapProps = {
  instant: number
  coords: Coordinates
}

export function SwedenMap({ instant, coords }: SwedenMapProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const gridRef = React.useRef<LightGrid | null>(null)
  const bufferRef = React.useRef<HTMLCanvasElement | null>(null)
  const imageRef = React.useRef<ImageData | null>(null)

  const clipId = React.useId()
  const projection = React.useMemo(() => createProjection(WIDTH, HEIGHT), [])

  const rings = React.useMemo(
    () =>
      SWEDEN_RINGS.map((ring) =>
        ring.map(([longitude, latitude]) =>
          projection.project(longitude, latitude)
        )
      ),
    [projection]
  )

  const outline = React.useMemo(
    () =>
      rings
        .map(
          (ring) =>
            "M" +
            ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") +
            "Z"
        )
        .join(" "),
    [rings]
  )

  // Declination and the equation of time are the same everywhere on Earth at a
  // given instant. Only the hour angle varies across the map, and it does so by
  // exactly one degree per degree of longitude — so the whole field follows
  // from two numbers.
  const { declination, equationOfTime } = sunAngles(instant)
  const minutesUtc =
    (((instant % 86_400_000) + 86_400_000) % 86_400_000) / 60_000
  const baseHourAngle = (minutesUtc + equationOfTime) / 4 - 180
  /** Longitude with the sun straight overhead: where the hour angle is zero. */
  const subsolarLongitude = -(((baseHourAngle + 540) % 360) - 180)

  const contours = isoElevationLevels()
    .map((level) =>
      isoElevationLine(level, declination, subsolarLongitude, projection, {
        width: WIDTH,
        height: HEIGHT,
      })
    )
    .filter((line) => line.d !== "")

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    if (!gridRef.current) {
      gridRef.current = buildLightGrid(FIELD_WIDTH, FIELD_HEIGHT, (u, v) =>
        projection.unproject(u * WIDTH, v * HEIGHT)
      )
    }
    if (!bufferRef.current) {
      const buffer = document.createElement("canvas")
      buffer.width = FIELD_WIDTH
      buffer.height = FIELD_HEIGHT
      bufferRef.current = buffer
    }

    const buffer = bufferRef.current
    const bufferContext = buffer.getContext("2d")
    const context = canvas.getContext("2d")
    if (!bufferContext || !context) {
      return
    }

    if (!imageRef.current) {
      imageRef.current = bufferContext.createImageData(
        FIELD_WIDTH,
        FIELD_HEIGHT
      )
    }
    const image = imageRef.current
    paintLightField(image.data, gridRef.current, declination, baseHourAngle)

    bufferContext.putImageData(image, 0, 0)

    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(WIDTH * ratio)) {
      canvas.width = Math.round(WIDTH * ratio)
      canvas.height = Math.round(HEIGHT * ratio)
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, WIDTH, HEIGHT)
    context.save()
    // Clipping happens at full resolution, so the coastline stays crisp even
    // though the field behind it is coarse.
    context.clip(new Path2D(outline))
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(buffer, 0, 0, WIDTH, HEIGHT)
    context.restore()
  }, [outline, projection, declination, baseHourAngle])

  const here = projection.project(coords.longitude, coords.latitude)
  const herePosition = solarPosition(instant, coords)
  // Azimuth runs clockwise from north, and north is up on the map.
  const azimuth = herePosition.azimuth * DEG
  const arrowLength = 28

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Map of Sweden shaded by how directly the sun strikes the ground"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={outline} />
          </clipPath>
        </defs>

        {/* Contours of equal sun height, five degrees apart. */}
        <g clipPath={`url(#${clipId})`}>
          {contours.map((line) => (
            <path
              key={line.elevation}
              d={line.d}
              fill="none"
              stroke={
                line.elevation >= 0
                  ? "rgba(70,36,0,0.38)"
                  : "rgba(226,228,255,0.32)"
              }
              strokeWidth={line.elevation === 0 ? 1.6 : 0.9}
            />
          ))}
        </g>

        {contours.map((line) =>
          line.label && onLand(rings, line.label[0], line.label[1]) ? (
            <text
              key={line.elevation}
              x={line.label[0]}
              y={line.label[1] - 2.5}
              textAnchor="middle"
              className="text-[9px]"
              fill={
                line.elevation >= 0
                  ? "rgba(56,28,0,0.85)"
                  : "rgba(236,238,255,0.85)"
              }
              style={{
                paintOrder: "stroke",
                stroke:
                  line.elevation >= 0
                    ? "rgba(255,244,206,0.75)"
                    : "rgba(24,26,54,0.6)",
                strokeWidth: 2.5,
              }}
            >
              {line.elevation === -0.833 ? "sunrise" : `${line.elevation}°`}
            </text>
          ) : null
        )}

        <path
          d={outline}
          fill="none"
          className="stroke-foreground/40"
          strokeWidth={1}
          strokeLinejoin="round"
        />

        {SWEDISH_PLACES.map((place) => {
          const [x, y] = projection.project(place.longitude, place.latitude)
          // Rounded away from a bare "-0" for the minute either side of level.
          const elevation = Math.round(solarPosition(instant, place).elevation)
          return (
            <g key={place.name}>
              <circle
                cx={x}
                cy={y}
                r={2.5}
                className="fill-background stroke-foreground/70"
                strokeWidth={1}
              />
              <text
                x={x + 6}
                y={y + 3.5}
                className="fill-foreground text-[10px]"
                style={{
                  paintOrder: "stroke",
                  stroke: "var(--color-card)",
                  strokeWidth: 3,
                }}
              >
                {place.name} {elevation === 0 ? 0 : elevation}°
              </text>
            </g>
          )
        })}

        {/* Where the readouts refer to, with an arrow pointing at the sun. */}
        <line
          x1={here[0]}
          y1={here[1]}
          x2={here[0] + Math.sin(azimuth) * arrowLength}
          y2={here[1] - Math.cos(azimuth) * arrowLength}
          className="stroke-sun"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle
          cx={here[0]}
          cy={here[1]}
          r={4.5}
          className="fill-sun stroke-foreground"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  )
}

const TWILIGHT_BANDS: Array<{ elevation: number; label: string }> = [
  { elevation: -3, label: "Civil twilight" },
  { elevation: -9, label: "Nautical" },
  { elevation: -15, label: "Astronomical" },
  { elevation: -25, label: "Night" },
]

/** Reads the same colour scale the map is painted with. */
export function SunLegend() {
  const gradient = Array.from({ length: 11 }, (_, index) =>
    cssColor(irradianceColor(index / 10))
  ).join(", ")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">
            Sun up — energy per m² of flat ground
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            0 → 100%
          </span>
        </div>
        <div
          className="h-3 w-full rounded-full border border-border"
          style={{ background: `linear-gradient(to right, ${gradient})` }}
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className="size-3 shrink-0 rounded-sm border border-border"
            style={{ background: cssColor(REFRACTION_COLOR) }}
          />
          <span className="text-xs text-muted-foreground">
            Lit only by bent light
          </span>
        </div>
        {TWILIGHT_BANDS.map((band) => (
          <div key={band.label} className="flex items-center gap-1.5">
            <span
              className="size-3 shrink-0 rounded-sm border border-border"
              style={{ background: cssColor(fieldColor(band.elevation)) }}
            />
            <span className="text-xs text-muted-foreground">{band.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
