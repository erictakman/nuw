import * as React from "react"
import {
  IconArrowRight,
  IconMoon,
  IconPlayerPause,
  IconPlayerPlay,
  IconSun,
} from "@tabler/icons-react"

import {
  airMass,
  compassPoint,
  dayEvents,
  dayOfYear,
  daysInYear,
  findMirrorInstant,
  formatDate,
  formatTime,
  fromLocal,
  isSummerTime,
  localNoon,
  MS_PER_DAY,
  noonOfDayIndex,
  solarPosition,
  solsticeInstant,
  toDateInputValue,
  toLocal,
  type Coordinates,
  type DayEvents,
  type SolarPosition,
} from "@/lib/solar"
import { DEFAULT_PLACE, isInSweden, SWEDISH_PLACES } from "@/lib/places"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { DayArcChart } from "@/components/day-arc-chart"
import { SunLegend, SwedenMap } from "@/components/sweden-map"
import { GlobeRays } from "@/components/globe-rays"
import { YearChart } from "@/components/year-chart"

const STORAGE_KEY = "sun-position:v1"

type StoredState = {
  latitude: string
  longitude: string
  date: string
  minutes: number
}

function todayInSweden() {
  return toDateInputValue(Date.now())
}

function defaultState(): StoredState {
  return {
    latitude: DEFAULT_PLACE.latitude.toFixed(4),
    longitude: DEFAULT_PLACE.longitude.toFixed(4),
    date: todayInSweden(),
    minutes: 12 * 60,
  }
}

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultState()
    }

    const parsed = JSON.parse(raw) as Partial<StoredState>
    return {
      ...defaultState(),
      ...parsed,
      // A stored date is a snapshot of someone's last visit; today is more useful.
      date: typeof parsed.date === "string" ? parsed.date : todayInSweden(),
    }
  } catch {
    return defaultState()
  }
}

/** `YYYY-MM-DD` to calendar fields, rejecting anything that is not a real date. */
function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = localNoon(year, month, day)

  return toDateInputValue(candidate) === value ? { year, month, day } : null
}

function parseCoordinate(value: string, limit: number) {
  const parsed = Number(value.replace(",", "."))
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) {
    return null
  }
  return parsed
}

function formatDegrees(value: number) {
  return `${value.toFixed(2)}°`
}

function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60000)
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
}

function formatClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

/** One labelled number in a readout grid. */
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  )
}

type MomentCardProps = {
  title: string
  caption: string
  instant: number
  position: SolarPosition
  events: DayEvents
  tone: "sun" | "twin"
}

function MomentCard({
  title,
  caption,
  instant,
  position,
  events,
  tone,
}: MomentCardProps) {
  const isUp = position.elevation > 0

  return (
    <Card className={cn("gap-3", tone === "twin" && "border-twin/40")}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              tone === "sun" ? "bg-sun" : "bg-twin"
            )}
          />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription className="text-xs">{caption}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <div className="font-heading text-lg">{formatDate(instant)}</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl">{formatTime(instant)}</span>
            <Badge variant="outline" className="font-mono">
              {isSummerTime(instant) ? "CEST" : "CET"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label="Elevation"
            value={
              <span className="inline-flex items-center gap-1">
                {isUp ? (
                  <IconSun className="size-3.5 text-sun" />
                ) : (
                  <IconMoon className="size-3.5 text-muted-foreground" />
                )}
                {formatDegrees(position.elevation)}
              </span>
            }
          />
          <Stat
            label="Direction"
            value={`${position.azimuth.toFixed(1)}° ${compassPoint(position.azimuth)}`}
          />
          <Stat
            label="Declination"
            value={formatDegrees(position.declination)}
          />
          <Stat
            label="Sunrise"
            value={events.sunrise ? formatTime(events.sunrise) : "—"}
          />
          <Stat label="Solar noon" value={formatTime(events.solarNoon)} />
          <Stat
            label="Sunset"
            value={events.sunset ? formatTime(events.sunset) : "—"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {events.kind === "polar-day" ? (
            <Badge variant="secondary">Midnight sun — it never sets</Badge>
          ) : events.kind === "polar-night" ? (
            <Badge variant="secondary">Polar night — it never rises</Badge>
          ) : (
            <Badge variant="secondary">
              {formatDuration(events.sunset! - events.sunrise!)} of daylight
            </Badge>
          )}
          <Badge variant="outline">
            peaks at {formatDegrees(events.maxElevation)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

export function SunPosition() {
  const [state, setState] = React.useState<StoredState>(loadState)

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Private-mode storage can throw; the app works fine without persistence.
    }
  }, [state])

  const [playing, setPlaying] = React.useState(false)

  // Sweep the clock through a whole day in about twenty seconds. Whole minutes
  // go into state; the fraction is carried in a ref so slow frames do not lose
  // time.
  React.useEffect(() => {
    if (!playing) {
      return undefined
    }

    let frame = 0
    let previous = performance.now()
    let carry = 0

    const step = (now: number) => {
      carry += (now - previous) * 0.072
      previous = now
      const whole = Math.floor(carry)
      if (whole > 0) {
        carry -= whole
        setState((current) => ({
          ...current,
          minutes: (current.minutes + whole) % 1440,
        }))
      }
      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const latitude = parseCoordinate(state.latitude, 90)
  const longitude = parseCoordinate(state.longitude, 180)
  const coordsValid = latitude !== null && longitude !== null

  const coords = React.useMemo<Coordinates>(
    () => ({
      latitude: latitude ?? DEFAULT_PLACE.latitude,
      longitude: longitude ?? DEFAULT_PLACE.longitude,
    }),
    [latitude, longitude]
  )

  const date = parseDate(state.date) ?? parseDate(todayInSweden())!
  const instant = fromLocal({
    ...date,
    hour: Math.floor(state.minutes / 60),
    minute: state.minutes % 60,
  })

  const position = solarPosition(instant, coords)
  const events = dayEvents(localNoon(date.year, date.month, date.day), coords)

  // Cheap enough to redo every render: a few hundred trig evaluations.
  const mirror = findMirrorInstant(instant, coords)
  const mirrorPosition = solarPosition(mirror.instant, coords)
  const mirrorLocal = toLocal(mirror.instant)
  const mirrorEvents = dayEvents(
    localNoon(mirrorLocal.year, mirrorLocal.month, mirrorLocal.day),
    coords
  )

  const dayCount = daysInYear(date.year)
  const selectedDay = dayOfYear(instant)
  const daysApart = Math.abs(
    Math.round((mirror.instant - instant) / MS_PER_DAY)
  )
  const gapBefore = Math.abs(instant - mirror.pivot) / MS_PER_DAY
  const gapAfter = Math.abs(mirror.instant - mirror.pivot) / MS_PER_DAY

  const setDay = (day: number) => {
    const next = noonOfDayIndex(
      date.year,
      Math.min(dayCount - 1, Math.max(0, day))
    )
    setState((current) => ({ ...current, date: toDateInputValue(next) }))
  }

  const jumpTo = (target: number) => {
    setState((current) => ({ ...current, date: toDateInputValue(target) }))
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Where the sun stands over Sweden
          </CardTitle>
          <CardDescription>
            Pick a place, a date and a time. The app works out how high the sun
            is, then finds the moment on the other side of the year when it
            stands at exactly the same height.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {SWEDISH_PLACES.map((place) => {
              const active =
                Math.abs(place.latitude - coords.latitude) < 0.001 &&
                Math.abs(place.longitude - coords.longitude) < 0.001

              return (
                <Button
                  key={place.name}
                  size="xs"
                  variant={active ? "default" : "outline"}
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      latitude: place.latitude.toFixed(4),
                      longitude: place.longitude.toFixed(4),
                    }))
                  }
                >
                  {place.name}
                </Button>
              )
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Latitude °N</span>
              <Input
                inputMode="decimal"
                value={state.latitude}
                aria-invalid={latitude === null}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    latitude: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                Longitude °E
              </span>
              <Input
                inputMode="decimal"
                value={state.longitude}
                aria-invalid={longitude === null}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    longitude: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Date</span>
              <Input
                type="date"
                value={state.date}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                Time (Swedish clock)
              </span>
              <Input
                type="time"
                value={formatClock(state.minutes)}
                onChange={(event) => {
                  const [hour, minute] = event.target.value.split(":")
                  const minutes = Number(hour) * 60 + Number(minute)
                  if (Number.isFinite(minutes)) {
                    setState((current) => ({ ...current, minutes }))
                  }
                }}
              />
            </label>
          </div>

          {!coordsValid ? (
            <p className="text-xs text-destructive">
              Latitude must be between -90 and 90, longitude between -180 and
              180. Falling back to Stockholm until that is fixed.
            </p>
          ) : !isInSweden(coords) ? (
            <p className="text-xs text-muted-foreground">
              That point is outside Sweden — the maths still holds, but the
              clock stays on Swedish time.
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">
                  Day of year
                </span>
                <span className="font-mono text-xs">
                  {formatDate(instant)} · day {selectedDay + 1} of {dayCount}
                </span>
              </div>
              <Slider
                min={0}
                max={dayCount - 1}
                step={1}
                value={selectedDay}
                onValueChange={setDay}
                aria-label="Day of year"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">
                  Time of day
                </span>
                <span className="font-mono text-xs">
                  {formatClock(state.minutes)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={playing ? "Pause" : "Play through the day"}
                  onClick={() => setPlaying((current) => !current)}
                >
                  {playing ? <IconPlayerPause /> : <IconPlayerPlay />}
                </Button>
                <Slider
                  min={0}
                  max={1439}
                  step={1}
                  value={state.minutes}
                  onValueChange={(minutes) => {
                    setPlaying(false)
                    setState((current) => ({ ...current, minutes }))
                  }}
                  aria-label="Time of day"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => jumpTo(Date.now())}
            >
              Today
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => jumpTo(solsticeInstant(date.year, "summer"))}
            >
              Midsummer solstice
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => jumpTo(solsticeInstant(date.year, "winter"))}
            >
              Winter solstice
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => jumpTo(localNoon(date.year, 5, 5))}
            >
              5 May
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where the light lands, {formatTime(instant)}</CardTitle>
          <CardDescription className="text-xs">
            Every point of Sweden shaded by how much sunlight a flat square
            metre there is collecting at this instant. Move the date and time
            sliders — or press play — and watch the edge sweep across.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,300px)_1fr]">
          <SwedenMap instant={instant} coords={coords} />

          <div className="flex flex-col gap-4">
            <SunLegend />

            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Energy here vs overhead"
                value={`${Math.round(Math.max(0, Math.sin((position.elevation * Math.PI) / 180)) * 100)}%`}
              />
              <Stat
                label="Air mass"
                value={
                  Number.isFinite(airMass(position.elevation))
                    ? `${airMass(position.elevation).toFixed(2)}×`
                    : "—"
                }
              />
              <Stat
                label="Kiruna"
                value={formatDegrees(
                  solarPosition(instant, SWEDISH_PLACES[0]).elevation
                )}
              />
              <Stat
                label="Malmö"
                value={formatDegrees(
                  solarPosition(
                    instant,
                    SWEDISH_PLACES[SWEDISH_PLACES.length - 1]
                  ).elevation
                )}
              />
            </div>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground">Air mass</span> piles on top
                of that: a low sun shines through a far longer slab of
                atmosphere — about 38 times the overhead thickness right at the
                horizon — which is what makes it dim and red.
              </p>
              <p>
                <span className="text-foreground">Atmospheric refraction</span>{" "}
                is the bending itself. Air is denser low down, so light curves
                gently towards the ground and follows the Earth&apos;s curvature
                a little way past the geometric horizon — about 34 arcminutes at
                the horizon, half a degree. The rose strip is the ground that
                the bend lifts into daylight: without an atmosphere it would be
                dark. It also stretches Swedish days by several minutes at each
                end.
              </p>
              <p>
                The moving boundary itself is the{" "}
                <span className="text-foreground">terminator</span>. It runs
                north-south at the equinoxes and tilts hard at the solstices,
                which is why in June it can leave the north of Sweden lit while
                the south has already dropped into twilight.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>One beam, more ground</CardTitle>
          <CardDescription className="text-xs">
            The same country on a curved Earth, lit by parallel sunbeams. Every
            thin line carries the same energy; the red patch is the ground a
            single beam has to cover. Sweden runs 1 570 km up the curve, so the
            beam that lands almost square on Skåne arrives at a slant in
            Lappland and smears over far more ground.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <GlobeRays instant={instant} coords={coords} />

          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground">
                Lambert&apos;s cosine law.
              </span>{" "}
              Tilt a surface away from a beam and the same light spreads over
              1/sin(elevation) as much ground, so each square metre collects
              sin(elevation) of what it would with the sun overhead — 100% at
              the zenith, 50% at 30°, 9% at 5°. Nothing about the sunlight
              changes; only the angle it meets the ground at.
            </p>
            <p>
              Two things set that angle. The Earth&apos;s{" "}
              <span className="text-foreground">curvature</span> means every
              degree of latitude tips the ground a degree further from the beam,
              and the 23.4° <span className="text-foreground">tilt</span> of the
              axis swings which latitude gets the square-on hit through the
              year. In June the tilt lifts the whole country towards the sun; in
              December it leans the same country away.
            </p>
            <p>
              The stretch factor next to each city is exactly 1/sin(elevation) —
              the number of square metres of Swedish ground it takes to catch
              what one square metre of beam is carrying.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The sun's height across {date.year}</CardTitle>
          <CardDescription className="text-xs">
            The shaded band is everything the sun sweeps through in a day, from
            solar noon down to solar midnight. The solid line is its height at{" "}
            {formatClock(state.minutes)} on each day of the year — drag it, or
            drag anywhere on the chart.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          <YearChart
            year={date.year}
            coords={coords}
            minutesOfDay={state.minutes}
            selectedDay={selectedDay}
            mirrorInstant={mirror.instant}
            elevation={position.elevation}
            pivot={mirror.pivot}
            onSelectDay={setDay}
          />
        </CardContent>
      </Card>

      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base">
              {formatDegrees(position.elevation)}
            </span>
            <IconArrowRight className="size-4 text-muted-foreground" />
            <span className="text-sm font-normal text-muted-foreground">
              the same height again on
            </span>
            <span className="font-mono text-base text-twin">
              {formatDate(mirror.instant)}, {formatTime(mirror.instant)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{daysApart} days apart</Badge>
          <Badge variant="secondary">
            mirrored about the{" "}
            {mirror.pivotKind === "summer" ? "June" : "December"} solstice
          </Badge>
          <Badge variant="outline" className="font-mono">
            {gapBefore.toFixed(1)} d ↔ {gapAfter.toFixed(1)} d from the solstice
          </Badge>
          {mirror.clamped ? (
            <Badge variant="destructive">
              closest reachable match ({formatDegrees(mirror.elevationError)}{" "}
              off)
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <MomentCard
          title="Your moment"
          caption="The date and time you picked"
          instant={instant}
          position={position}
          events={events}
          tone="sun"
        />
        <MomentCard
          title="Its twin"
          caption="Same sun height, other side of the year"
          instant={mirror.instant}
          position={mirrorPosition}
          events={mirrorEvents}
          tone="twin"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Both days, hour by hour</CardTitle>
          <CardDescription className="text-xs">
            The two arcs nearly overlap: twin dates share a declination, so the
            sun traces almost the same path. What separates them is the equation
            of time, which slides the whole arc sideways by up to a quarter of
            an hour.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          <DayArcChart
            coords={coords}
            instant={instant}
            mirrorInstant={mirror.instant}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why there is a twin at all</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            <span className="text-foreground">Declination</span> is how far
            north or south of the equator the sun sits, swinging between ±23.44°
            once a year. It sets how high the whole daily arc rides, so every
            value except the two solstice extremes happens on exactly two dates
            — one climbing, one falling.
          </p>
          <p>
            <span className="text-foreground">Hour angle</span> is where along
            that arc the sun currently is: 15° per hour, zero at solar noon.
            Match the declination and the hour angle and the sun is in the same
            place in the sky, full stop.
          </p>
          <p>
            <span className="text-foreground">
              The twin is not a calendar mirror.
            </span>{" "}
            Reflecting the date about the solstice gets close, but Earth moves
            fastest near perihelion in early January and slowest near aphelion
            in July, so the two halves are not equal — which is why the gaps
            above differ by a day or so. This app bisects on the real
            declination curve instead of assuming symmetry, then solves for the
            clock time that lands on exactly the same height.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
