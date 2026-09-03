import * as React from "react"

import {
  fromLocal,
  solarPosition,
  toLocal,
  type Coordinates,
} from "@/lib/solar"
import { SunGlyph } from "@/components/sun-glyph"

const WIDTH = 760
const HEIGHT = 210
const PAD_LEFT = 38
const PAD_RIGHT = 16
const PAD_TOP = 14
const PAD_BOTTOM = 26

const INNER_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT
const INNER_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM

/** Sampling step in minutes: the arc is smooth, so ten minutes is plenty. */
const STEP = 10

type DayArcChartProps = {
  coords: Coordinates
  instant: number
  mirrorInstant: number
}

/** One day's worth of sun height, sampled against the Swedish wall clock. */
function sampleDay(instant: number, coords: Coordinates) {
  const { year, month, day } = toLocal(instant)
  const samples: Array<[number, number]> = []

  for (let minute = 0; minute <= 1440; minute += STEP) {
    const at = fromLocal({
      year,
      month,
      day,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
    })
    samples.push([minute, solarPosition(at, coords).elevation])
  }

  return samples
}

/** Minutes past local midnight for an instant. */
function minutesOf(instant: number) {
  const { hour, minute } = toLocal(instant)
  return hour * 60 + minute
}

/**
 * The two days drawn on top of each other. Because the twin dates share a
 * declination, the arcs almost coincide — the visible gap is the equation of
 * time sliding the whole arc sideways by up to a quarter of an hour.
 */
export function DayArcChart({
  coords,
  instant,
  mirrorInstant,
}: DayArcChartProps) {
  const today = React.useMemo(
    () => sampleDay(instant, coords),
    [instant, coords]
  )
  const twin = React.useMemo(
    () => sampleDay(mirrorInstant, coords),
    [mirrorInstant, coords]
  )

  const domain = React.useMemo(() => {
    const values = [...today, ...twin].map(([, elevation]) => elevation)
    return {
      high: Math.max(...values) + 6,
      low: Math.min(...values) - 6,
    }
  }, [today, twin])

  const x = (minute: number) => PAD_LEFT + (minute / 1440) * INNER_WIDTH
  const y = (value: number) =>
    PAD_TOP +
    ((domain.high - value) / (domain.high - domain.low)) * INNER_HEIGHT

  const path = (samples: Array<[number, number]>) =>
    samples
      .map(
        ([minute, value], index) =>
          `${index === 0 ? "M" : "L"}${x(minute).toFixed(2)} ${y(value).toFixed(2)}`
      )
      .join(" ")

  const horizonY = y(0)
  const elevation = solarPosition(instant, coords).elevation

  const ticks: number[] = []
  for (
    let value = Math.ceil(domain.low / 15) * 15;
    value <= domain.high;
    value += 15
  ) {
    ticks.push(value)
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full select-none"
      role="img"
      aria-label="The sun's height through both days, hour by hour"
    >
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

      {Array.from({ length: 9 }, (_, index) => index * 3).map((hour) => (
        <g key={hour}>
          <line
            x1={x(hour * 60)}
            x2={x(hour * 60)}
            y1={PAD_TOP}
            y2={PAD_TOP + INNER_HEIGHT}
            className="stroke-border/60"
            strokeWidth={1}
          />
          <text
            x={x(hour * 60)}
            y={HEIGHT - 9}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[9px]"
          >
            {String(hour).padStart(2, "0")}
          </text>
        </g>
      ))}

      <line
        x1={PAD_LEFT}
        x2={WIDTH - PAD_RIGHT}
        y1={horizonY}
        y2={horizonY}
        className="stroke-muted-foreground"
        strokeWidth={1}
      />
      <text
        x={WIDTH - PAD_RIGHT - 2}
        y={horizonY - 4}
        textAnchor="end"
        className="fill-muted-foreground text-[9px]"
      >
        horizon
      </text>

      <line
        x1={PAD_LEFT}
        x2={WIDTH - PAD_RIGHT}
        y1={y(elevation)}
        y2={y(elevation)}
        className="stroke-twin"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />

      <path
        d={path(twin)}
        fill="none"
        className="stroke-twin"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      <path
        d={path(today)}
        fill="none"
        className="stroke-sun"
        strokeWidth={2.5}
      />

      <SunGlyph
        x={x(minutesOf(mirrorInstant))}
        y={y(elevation)}
        radius={5}
        variant="outline"
        className="text-twin"
      />
      <SunGlyph
        x={x(minutesOf(instant))}
        y={y(elevation)}
        radius={6}
        className="text-sun"
      />
    </svg>
  )
}
