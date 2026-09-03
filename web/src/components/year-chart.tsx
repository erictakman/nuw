import * as React from "react"

import {
  dayEvents,
  daysInYear,
  dayOfYear,
  fromLocal,
  localNoon,
  MS_PER_HOUR,
  noonOfDayIndex,
  solarPosition,
  solsticeInstant,
  toLocal,
  type Coordinates,
} from "@/lib/solar"
import { SunGlyph } from "@/components/sun-glyph"

const WIDTH = 760
const HEIGHT = 300
const PAD_LEFT = 38
const PAD_RIGHT = 16
const PAD_TOP = 18
const PAD_BOTTOM = 28

const INNER_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT
const INNER_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM

const MONTH_LABELS = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
]

type YearChartProps = {
  year: number
  coords: Coordinates
  /** Minutes past local midnight — the clock time the curve is sampled at. */
  minutesOfDay: number
  selectedDay: number
  mirrorInstant: number
  /** Elevation shared by the two moments; drawn as the horizontal match line. */
  elevation: number
  /** The solstice the two dates are reflected about. */
  pivot: number
  onSelectDay: (day: number) => void
}

function line(points: Array<[number, number]>) {
  return points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
    )
    .join(" ")
}

export function YearChart({
  year,
  coords,
  minutesOfDay,
  selectedDay,
  mirrorInstant,
  elevation,
  pivot,
  onSelectDay,
}: YearChartProps) {
  const dayCount = React.useMemo(() => daysInYear(year), [year])

  // The daily envelope: how high the sun climbs at solar noon and how far it
  // sinks at solar midnight. Only latitude and the date matter, so this does
  // not change while the time-of-day slider moves.
  const envelope = React.useMemo(() => {
    const highs: number[] = []
    const lows: number[] = []

    for (let day = 0; day < dayCount; day++) {
      const events = dayEvents(noonOfDayIndex(year, day), coords)
      highs.push(solarPosition(events.solarNoon, coords).elevation)
      lows.push(
        solarPosition(events.solarNoon + 12 * MS_PER_HOUR, coords).elevation
      )
    }

    return { highs, lows }
  }, [year, coords, dayCount])

  // The sun's height at one fixed clock time, every day of the year. This is
  // the curve the match line crosses twice.
  const atTime = React.useMemo(() => {
    const hour = Math.floor(minutesOfDay / 60)
    const minute = minutesOfDay % 60
    const values: number[] = []

    for (let day = 0; day < dayCount; day++) {
      const local = toLocal(noonOfDayIndex(year, day))
      const instant = fromLocal({
        year: local.year,
        month: local.month,
        day: local.day,
        hour,
        minute,
      })
      values.push(solarPosition(instant, coords).elevation)
    }

    return values
  }, [year, coords, dayCount, minutesOfDay])

  const domain = React.useMemo(() => {
    const high = Math.max(...envelope.highs) + 5
    const low = Math.min(...envelope.lows) - 5
    return { high, low }
  }, [envelope])

  const x = React.useCallback(
    (day: number) => PAD_LEFT + (day / (dayCount - 1)) * INNER_WIDTH,
    [dayCount]
  )
  const y = React.useCallback(
    (value: number) =>
      PAD_TOP +
      ((domain.high - value) / (domain.high - domain.low)) * INNER_HEIGHT,
    [domain]
  )

  // Traced along the daily highs, then back along the daily lows.
  const bandPath = [
    line(
      envelope.highs.map((value, day) => [x(day), y(value)] as [number, number])
    ),
    ...envelope.lows
      .map((value, day) => `L${x(day).toFixed(2)} ${y(value).toFixed(2)}`)
      .reverse(),
    "Z",
  ].join(" ")

  const curvePath = line(
    atTime.map((value, day) => [x(day), y(value)] as [number, number])
  )

  const horizonY = y(0)
  const matchY = y(elevation)

  const mirrorLocal = toLocal(mirrorInstant)
  const mirrorDay = mirrorLocal.year === year ? dayOfYear(mirrorInstant) : null

  const ticks = React.useMemo(() => {
    const step = domain.high - domain.low > 90 ? 30 : 15
    const values: number[] = []
    for (
      let value = Math.ceil(domain.low / step) * step;
      value <= domain.high;
      value += step
    ) {
      values.push(value)
    }
    return values
  }, [domain])

  const solstices = React.useMemo(
    () =>
      (["summer", "winter"] as const).map((kind) => {
        const instant = solsticeInstant(year, kind)
        return { kind, instant, day: dayOfYear(instant) }
      }),
    [year]
  )

  const handlePointer = (event: React.PointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left) / bounds.width
    const day = Math.round(ratio * (dayCount - 1))
    onSelectDay(Math.min(dayCount - 1, Math.max(0, day)))
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full touch-none select-none"
      role="img"
      aria-label={`Sun elevation through ${year}, with the matching day marked`}
    >
      {/* Sky above the horizon, ground below it. */}
      <rect
        x={PAD_LEFT}
        y={PAD_TOP}
        width={INNER_WIDTH}
        height={Math.max(0, horizonY - PAD_TOP)}
        className="fill-daylight/40"
      />
      <rect
        x={PAD_LEFT}
        y={horizonY}
        width={INNER_WIDTH}
        height={Math.max(0, PAD_TOP + INNER_HEIGHT - horizonY)}
        className="fill-night/10"
      />

      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={y(value)}
            y2={y(value)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text
            x={PAD_LEFT - 6}
            y={y(value) + 3}
            textAnchor="end"
            className="fill-muted-foreground font-mono text-[9px]"
          >
            {value}°
          </text>
        </g>
      ))}

      {/* Everything the sun sweeps through in a day, from solar noon down to
          solar midnight. */}
      <path d={bandPath} className="fill-sun-soft/25" />

      {MONTH_LABELS.map((label, index) => {
        const day = dayOfYear(localNoon(year, index + 1, 1))
        return (
          <g key={index}>
            <line
              x1={x(day)}
              x2={x(day)}
              y1={PAD_TOP}
              y2={PAD_TOP + INNER_HEIGHT}
              className="stroke-border/60"
              strokeWidth={1}
            />
            <text
              x={x(day) + 3}
              y={HEIGHT - 10}
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {label}
            </text>
          </g>
        )
      })}

      {solstices.map(({ kind, day, instant }) => (
        <line
          key={kind}
          x1={x(day)}
          x2={x(day)}
          y1={PAD_TOP}
          y2={PAD_TOP + INNER_HEIGHT}
          className={
            Math.abs(instant - pivot) < MS_PER_HOUR
              ? "stroke-twin"
              : "stroke-muted-foreground/40"
          }
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      ))}

      <line
        x1={PAD_LEFT}
        x2={WIDTH - PAD_RIGHT}
        y1={horizonY}
        y2={horizonY}
        className="stroke-muted-foreground"
        strokeWidth={1}
      />

      <path
        d={curvePath}
        fill="none"
        className="stroke-sun"
        strokeWidth={2.5}
      />

      {/* The whole point: one height, two dates. */}
      <line
        x1={PAD_LEFT}
        x2={WIDTH - PAD_RIGHT}
        y1={matchY}
        y2={matchY}
        className="stroke-twin"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />

      {mirrorDay !== null ? (
        <g>
          <line
            x1={x(mirrorDay)}
            x2={x(mirrorDay)}
            y1={matchY}
            y2={PAD_TOP + INNER_HEIGHT}
            className="stroke-twin/50"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <SunGlyph
            x={x(mirrorDay)}
            y={matchY}
            radius={5}
            variant="outline"
            className="text-twin"
          />
        </g>
      ) : null}

      <line
        x1={x(selectedDay)}
        x2={x(selectedDay)}
        y1={matchY}
        y2={PAD_TOP + INNER_HEIGHT}
        className="stroke-sun/60"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <SunGlyph x={x(selectedDay)} y={matchY} radius={6} className="text-sun" />

      <rect
        x={PAD_LEFT}
        y={PAD_TOP}
        width={INNER_WIDTH}
        height={INNER_HEIGHT}
        fill="transparent"
        className="cursor-crosshair"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          handlePointer(event)
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) {
            handlePointer(event)
          }
        }}
      />
    </svg>
  )
}
