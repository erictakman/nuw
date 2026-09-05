/**
 * Solar position math for a fixed observer, plus the "other side of the year"
 * search that this app is built around.
 *
 * The astronomy is the NOAA solar-position algorithm (itself a condensed form
 * of Meeus, *Astronomical Algorithms*). Everything below works on absolute
 * instants (UTC milliseconds); wall-clock conversion lives at the bottom of the
 * file so the physics never has to think about DST.
 */

const DEG = Math.PI / 180
const RAD = 180 / Math.PI
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/** Unix epoch expressed as a Julian Day number. */
const JULIAN_EPOCH = 2440587.5
/** J2000.0, the epoch the polynomials below are centred on. */
const JULIAN_J2000 = 2451545
const DAYS_PER_JULIAN_CENTURY = 36525

/** Sweden observes CET/CEST; every wall clock in this app is this zone. */
export const SWEDEN_TIME_ZONE = "Europe/Stockholm"

/**
 * Geometric elevation of the *upper limb* at sunrise/sunset: -50 arcminutes,
 * which bundles the 16' solar radius with 34' of average refraction.
 */
const SUNRISE_ELEVATION = -0.833

export type Coordinates = {
  /** Degrees north of the equator. */
  latitude: number
  /** Degrees east of Greenwich. */
  longitude: number
}

export type SolarPosition = {
  /** Elevation above the horizon in degrees, corrected for refraction. */
  elevation: number
  /** Elevation ignoring refraction — the value the geometry actually solves. */
  geometricElevation: number
  /** Compass bearing of the sun, degrees clockwise from true north. */
  azimuth: number
  /** Sun's declination in degrees: where it sits north/south of the equator. */
  declination: number
  /**
   * Hour angle in degrees. 0 is solar noon, negative is morning, positive is
   * afternoon; the sun moves through 15 degrees of it per hour.
   */
  hourAngle: number
  /** Sundial minus clock, in minutes (the "equation of time"). */
  equationOfTime: number
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

/** Julian Day number for an instant. */
function toJulianDay(ms: number) {
  return ms / MS_PER_DAY + JULIAN_EPOCH
}

/** Centuries elapsed since J2000.0 — the variable every polynomial uses. */
function toJulianCentury(ms: number) {
  return (toJulianDay(ms) - JULIAN_J2000) / DAYS_PER_JULIAN_CENTURY
}

type SunState = {
  declination: number
  equationOfTime: number
}

/**
 * Where the sun is on the ecliptic, and how far the real sun runs ahead of a
 * uniformly-moving "mean sun".
 *
 * The chain is: mean longitude and mean anomaly (a perfectly circular orbit),
 * then the equation of centre corrects for the orbit actually being an
 * ellipse, then a nutation term nudges the apparent longitude. Projecting that
 * longitude onto the tilted equator gives the declination.
 */
function sunState(ms: number): SunState {
  const t = toJulianCentury(ms)

  // Mean longitude and mean anomaly of the sun.
  const meanLongitude = normalizeDegrees(
    280.46646 + t * (36000.76983 + t * 0.0003032)
  )
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)

  // Equation of centre: the true anomaly minus the mean anomaly.
  const equationOfCentre =
    Math.sin(meanAnomaly * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomaly * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomaly * DEG) * 0.000289

  const trueLongitude = meanLongitude + equationOfCentre
  const omega = 125.04 - 1934.136 * t
  const apparentLongitude =
    trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG)

  // Axial tilt, the reason there are seasons at all.
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG)

  const declination =
    Math.asin(Math.sin(obliquity * DEG) * Math.sin(apparentLongitude * DEG)) *
    RAD

  // Equation of time: obliquity ("varY") and eccentricity pulling in turn.
  const varY = Math.tan((obliquity / 2) * DEG) ** 2
  const equationOfTime =
    4 *
    RAD *
    (varY * Math.sin(2 * meanLongitude * DEG) -
      2 * eccentricity * Math.sin(meanAnomaly * DEG) +
      4 *
        eccentricity *
        varY *
        Math.sin(meanAnomaly * DEG) *
        Math.cos(2 * meanLongitude * DEG) -
      0.5 * varY * varY * Math.sin(4 * meanLongitude * DEG) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * DEG))

  return { declination, equationOfTime }
}

/** Sun's declination in degrees — the seasonal signal on its own. */
export function solarDeclination(ms: number) {
  return sunState(ms).declination
}

/**
 * Declination and equation of time for an instant, without an observer. Both
 * are the same everywhere on Earth, so a map covering one country can compute
 * them once and vary only the hour angle across it.
 */
export function sunAngles(ms: number): SunState {
  return sunState(ms)
}

/**
 * Atmospheric refraction in degrees, which lifts the sun's apparent position.
 * It is worth ~34 arcminutes at the horizon and vanishes overhead, which is
 * why the sun is already fully visible when it is still geometrically below
 * the horizon.
 */
function refraction(elevation: number) {
  if (elevation > 85) {
    return 0
  }

  const tan = Math.tan(elevation * DEG)

  if (elevation > 5) {
    return (58.1 / tan - 0.07 / tan ** 3 + 0.000086 / tan ** 5) / 3600
  }

  if (elevation > -0.575) {
    return (
      (1735 +
        elevation *
          (-518.2 +
            elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)))) /
      3600
    )
  }

  return -20.772 / tan / 3600
}

/** Full sky position of the sun for an instant and a place. */
export function solarPosition(ms: number, coords: Coordinates): SolarPosition {
  const { declination, equationOfTime } = sunState(ms)
  const { latitude, longitude } = coords

  // Minutes since UTC midnight, then the sundial correction: the equation of
  // time, plus 4 minutes per degree of longitude east of Greenwich.
  const minutesUtc =
    (((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_MINUTE
  const trueSolarTime =
    (((minutesUtc + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440

  let hourAngle = trueSolarTime / 4 - 180
  if (hourAngle < -180) {
    hourAngle += 360
  }

  const latRad = latitude * DEG
  const decRad = declination * DEG
  const haRad = hourAngle * DEG

  const cosZenith =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)))
  const geometricElevation = 90 - zenith * RAD

  // Azimuth from the spherical law of cosines, then folded so that 0 is north.
  const sinZenith = Math.sin(zenith)
  let azimuth: number
  if (Math.abs(sinZenith) < 1e-9 || Math.abs(Math.cos(latRad)) < 1e-9) {
    azimuth = hourAngle > 0 ? 180 : 0
  } else {
    const cosAzimuth =
      (Math.sin(latRad) * Math.cos(zenith) - Math.sin(decRad)) /
      (Math.cos(latRad) * sinZenith)
    const base = Math.acos(Math.min(1, Math.max(-1, cosAzimuth))) * RAD
    azimuth =
      hourAngle > 0
        ? normalizeDegrees(base + 180)
        : normalizeDegrees(540 - base)
  }

  return {
    elevation: geometricElevation + refraction(geometricElevation),
    geometricElevation,
    azimuth,
    declination,
    hourAngle,
    equationOfTime,
  }
}

/**
 * Relative thickness of atmosphere the light crosses, 1 with the sun overhead.
 * Kasten & Young's fit, which stays sane down at the horizon where a plain
 * 1/sin(h) blows up — at sunrise the beam crosses about 38 atmospheres, which
 * is why it arrives dim and red.
 */
export function airMass(elevation: number) {
  if (elevation < -0.833) {
    return Infinity
  }
  const h = Math.max(elevation, 0)
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364))
}

/** Sixteen-point compass label for an azimuth. */
export function compassPoint(azimuth: number) {
  const points = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ]
  return points[Math.round(normalizeDegrees(azimuth) / 22.5) % 16]
}

export type DayKind = "normal" | "polar-day" | "polar-night"

export type DayEvents = {
  kind: DayKind
  solarNoon: number
  sunrise: number | null
  sunset: number | null
  /** Elevation at solar noon: the sun's highest point that day. */
  maxElevation: number
  /** Elevation at solar midnight: the sun's lowest point that day. */
  minElevation: number
}

/**
 * Instant of solar noon for the calendar day containing `anchorMs` in UTC.
 * Solved iteratively because the equation of time is itself a function of the
 * instant we are looking for.
 */
function solarNoonMs(anchorMs: number, coords: Coordinates) {
  const utcMidnight = Math.floor(anchorMs / MS_PER_DAY) * MS_PER_DAY
  let noon = utcMidnight + (720 - 4 * coords.longitude) * MS_PER_MINUTE

  for (let i = 0; i < 3; i++) {
    const { equationOfTime } = sunState(noon)
    noon =
      utcMidnight +
      (720 - 4 * coords.longitude - equationOfTime) * MS_PER_MINUTE
  }

  return noon
}

/** Sunrise, sunset and the day's elevation envelope for a given day. */
export function dayEvents(anchorMs: number, coords: Coordinates): DayEvents {
  const noon = solarNoonMs(anchorMs, coords)
  const { declination } = sunState(noon)

  const latRad = coords.latitude * DEG
  const decRad = declination * DEG

  const maxElevation = 90 - Math.abs(coords.latitude - declination)
  const minElevation = Math.abs(coords.latitude + declination) - 90

  // Hour angle at which the sun crosses the sunrise elevation. No solution
  // means the sun stays up (polar day) or stays down (polar night).
  const cosHourAngle =
    (Math.cos((90 - SUNRISE_ELEVATION) * DEG) -
      Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad))

  if (cosHourAngle < -1) {
    return {
      kind: "polar-day",
      solarNoon: noon,
      sunrise: null,
      sunset: null,
      maxElevation,
      minElevation,
    }
  }

  if (cosHourAngle > 1) {
    return {
      kind: "polar-night",
      solarNoon: noon,
      sunrise: null,
      sunset: null,
      maxElevation,
      minElevation,
    }
  }

  const halfDayMs = ((Math.acos(cosHourAngle) * RAD) / 15) * MS_PER_HOUR

  return {
    kind: "normal",
    solarNoon: noon,
    sunrise: noon - halfDayMs,
    sunset: noon + halfDayMs,
    maxElevation,
    minElevation,
  }
}

/* ------------------------------------------------------------------ *
 * Solstices and the mirror-date search
 * ------------------------------------------------------------------ */

const solsticeCache = new Map<string, number>()

/**
 * Instant of a solstice, found by ternary search: declination is a smooth
 * unimodal function in the days around one, so we can squeeze the bracket
 * without ever differentiating it.
 */
export function solsticeInstant(year: number, kind: "summer" | "winter") {
  const key = `${year}:${kind}`
  const cached = solsticeCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const nominal =
    kind === "summer" ? Date.UTC(year, 5, 21) : Date.UTC(year, 11, 21)
  let lo = nominal - 5 * MS_PER_DAY
  let hi = nominal + 5 * MS_PER_DAY
  const sign = kind === "summer" ? 1 : -1

  for (let i = 0; i < 60; i++) {
    const a = lo + (hi - lo) / 3
    const b = hi - (hi - lo) / 3
    if (sign * solarDeclination(a) < sign * solarDeclination(b)) {
      lo = a
    } else {
      hi = b
    }
  }

  const result = (lo + hi) / 2
  solsticeCache.set(key, result)
  return result
}

/** The solstices bracketing `ms`, oldest first, spanning three years. */
function surroundingSolstices(ms: number) {
  const year = new Date(ms).getUTCFullYear()
  return [
    solsticeInstant(year - 1, "summer"),
    solsticeInstant(year - 1, "winter"),
    solsticeInstant(year, "summer"),
    solsticeInstant(year, "winter"),
    solsticeInstant(year + 1, "summer"),
  ]
}

export type MirrorResult = {
  /** The matching instant on the other side of the year. */
  instant: number
  /** The solstice the two dates are reflected about. */
  pivot: number
  /** Which solstice that was. */
  pivotKind: "summer" | "winter"
  /** Residual elevation difference in degrees; normally ~1e-9. */
  elevationError: number
  /** Hour angle reached at the match, for comparison with the original. */
  hourAngle: number
  /** True when the match had to be clamped (within a day of the solstice). */
  clamped: boolean
}

/**
 * Find the instant on the *other* branch of the year where the sun stands
 * exactly as it does at `ms`.
 *
 * Two things have to line up for the sun to repeat a position:
 *
 *  1. the **declination** — how high the sun's whole daily arc rides — which
 *     traces one rise and one fall per year, so every value occurs on exactly
 *     two dates;
 *  2. the **hour angle** — where along that arc the sun currently is.
 *
 * So we first bisect for the twin date (equal declination on the opposite
 * branch), then bisect again *within* that day for the clock time that
 * reproduces the same elevation on the same side of solar noon. Reflecting the
 * date about the solstice alone would be a few days off, because Earth moves
 * faster near perihelion in early January than near aphelion in July.
 */
export function findMirrorInstant(
  ms: number,
  coords: Coordinates
): MirrorResult {
  const solstices = surroundingSolstices(ms)

  // The instant always sits between two solstices; either one can serve as the
  // mirror, giving twins in adjacent cycles roughly a year apart.
  let after = solstices.findIndex((solstice) => solstice > ms)
  if (after < 1) {
    after = solstices.length - 1
  }
  const before = after - 1

  const nearest =
    ms - solstices[before] <= solstices[after] - ms ? before : after
  const alternative = nearest === before ? after : before

  const primary = mirrorAboutSolstice(ms, coords, solstices, nearest)
  if (toLocal(primary.instant).year === toLocal(ms).year) {
    return primary
  }

  // Reflecting about the nearest solstice can land in the neighbouring year
  // (a date in early January, say). The other solstice gives the same seasonal
  // answer inside the year the user is looking at, so prefer it when it fits.
  const fallback = mirrorAboutSolstice(ms, coords, solstices, alternative)
  return toLocal(fallback.instant).year === toLocal(ms).year
    ? fallback
    : primary
}

/** Bisect for the twin date about one specific solstice, then match the time. */
function mirrorAboutSolstice(
  ms: number,
  coords: Coordinates,
  solstices: number[],
  pivotIndex: number
): MirrorResult {
  const pivot = solstices[pivotIndex]
  const pivotKind = pivotIndex % 2 === 0 ? "summer" : "winter"
  const target = solarDeclination(ms)

  // First guess: reflect the date about the solstice. Then bracket the branch
  // that guess lands on, which runs from this solstice to the adjacent one.
  const guess = 2 * pivot - ms
  const neighbour =
    guess > pivot
      ? (solstices[pivotIndex + 1] ?? pivot + 183 * MS_PER_DAY)
      : (solstices[pivotIndex - 1] ?? pivot - 183 * MS_PER_DAY)

  const margin = MS_PER_HOUR
  let lo = Math.min(pivot, neighbour) + margin
  let hi = Math.max(pivot, neighbour) - margin

  const fLo = solarDeclination(lo) - target
  const fHi = solarDeclination(hi) - target

  let dateMatch: number
  if (fLo === 0) {
    dateMatch = lo
  } else if (fHi === 0) {
    dateMatch = hi
  } else if (fLo > 0 === fHi > 0) {
    // Only happens within an hour of a solstice, where the twin *is* today.
    dateMatch = Math.abs(fLo) < Math.abs(fHi) ? lo : hi
  } else {
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const fMid = solarDeclination(mid) - target
      if (fMid > 0 === fLo > 0) {
        lo = mid
      } else {
        hi = mid
      }
    }
    dateMatch = (lo + hi) / 2
  }

  // Equal declination fixes the twin to within a day, but not more: the sun's
  // declination keeps drifting through that day, so close to a solstice the
  // target height can fall just outside what the nominal day actually reaches.
  // Try the neighbouring days too and keep the one that both reaches the
  // height and does so nearest the original point in the daily arc.
  const originHourAngle = solarPosition(ms, coords).hourAngle
  let best: MirrorResult | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let offset = -2; offset <= 2; offset++) {
    const candidate = matchTimeOfDay(
      ms,
      dateMatch + offset * MS_PER_DAY,
      coords,
      pivot,
      pivotKind
    )
    const score = candidate.clamped
      ? 1e6 + candidate.elevationError
      : Math.abs(candidate.hourAngle - originHourAngle)

    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best as MirrorResult
}

/**
 * Given the twin *date*, walk along that day to the clock time where the sun
 * reaches the same elevation, staying on the morning or afternoon half of the
 * arc to match the original.
 */
function matchTimeOfDay(
  ms: number,
  dateMatch: number,
  coords: Coordinates,
  pivot: number,
  pivotKind: "summer" | "winter"
): MirrorResult {
  const origin = solarPosition(ms, coords)
  const targetElevation = origin.geometricElevation
  const morning = origin.hourAngle < 0

  const noon = solarNoonMs(dateMatch, coords)
  // Elevation rises monotonically from solar midnight to solar noon, and falls
  // back afterwards, so each half-day is a clean bisection target.
  let lo = morning ? noon - 12 * MS_PER_HOUR : noon
  let hi = morning ? noon : noon + 12 * MS_PER_HOUR

  const elevationAt = (at: number) =>
    solarPosition(at, coords).geometricElevation

  const loElevation = elevationAt(lo)
  const hiElevation = elevationAt(hi)
  const min = Math.min(loElevation, hiElevation)
  const max = Math.max(loElevation, hiElevation)

  if (targetElevation <= min || targetElevation >= max) {
    const clampTo =
      targetElevation <= min
        ? loElevation < hiElevation
          ? lo
          : hi
        : loElevation > hiElevation
          ? lo
          : hi
    return {
      instant: clampTo,
      pivot,
      pivotKind,
      elevationError: Math.abs(elevationAt(clampTo) - targetElevation),
      hourAngle: solarPosition(clampTo, coords).hourAngle,
      clamped: true,
    }
  }

  const increasing = hiElevation > loElevation
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const value = elevationAt(mid)
    if (value < targetElevation === increasing) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const instant = (lo + hi) / 2
  return {
    instant,
    pivot,
    pivotKind,
    elevationError: Math.abs(elevationAt(instant) - targetElevation),
    hourAngle: solarPosition(instant, coords).hourAngle,
    clamped: false,
  }
}

/* ------------------------------------------------------------------ *
 * Wall-clock conversion
 * ------------------------------------------------------------------ */

export type LocalDateTime = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SWEDEN_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

/** Wall-clock fields straight out of the zone database, via Intl. */
function lookupOffsetMinutes(ms: number) {
  const parts = partsFormatter.formatToParts(new Date(ms))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0")

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second")
  )
  return (asUtc - Math.floor(ms / 1000) * 1000) / MS_PER_MINUTE
}

type ZoneYear = {
  standard: number
  summer: number
  /** Instants the clocks change, or -Infinity where the zone has no DST. */
  start: number
  end: number
}

const zoneCache = new Map<number, ZoneYear>()

/** Bisect for the minute the offset changes between two instants. */
function findTransition(lo: number, hi: number) {
  const before = lookupOffsetMinutes(lo)
  for (let i = 0; i < 40; i++) {
    const middle = Math.floor((lo + hi) / 2)
    if (lookupOffsetMinutes(middle) === before) {
      lo = middle
    } else {
      hi = middle
    }
  }
  return hi
}

/**
 * Sweden's two clock changes for a year, found once and cached.
 *
 * Asking Intl for the offset costs a formatToParts every time, and the charts
 * ask hundreds of times per frame. A zone only changes offset twice a year, so
 * pinning down those two instants turns every later lookup into a comparison.
 * The transitions are still derived from the zone database rather than assumed,
 * so a rule change would be picked up.
 */
function zoneYear(year: number): ZoneYear {
  const cached = zoneCache.get(year)
  if (cached) {
    return cached
  }

  const january = Date.UTC(year, 0, 15)
  const july = Date.UTC(year, 6, 15)
  const standard = lookupOffsetMinutes(january)
  const summer = lookupOffsetMinutes(july)

  const zone: ZoneYear =
    standard === summer
      ? { standard, summer, start: -Infinity, end: -Infinity }
      : {
          standard,
          summer,
          start: findTransition(january, july),
          end: findTransition(july, Date.UTC(year + 1, 0, 15)),
        }

  zoneCache.set(year, zone)
  return zone
}

/** Offset of Europe/Stockholm from UTC, in minutes, at a given instant. */
function timeZoneOffsetMinutes(ms: number) {
  const zone = zoneYear(new Date(ms).getUTCFullYear())
  return ms >= zone.start && ms < zone.end ? zone.summer : zone.standard
}

/** Break an instant into Swedish wall-clock fields. */
export function toLocal(ms: number): LocalDateTime & { second: number } {
  const shifted = new Date(ms + timeZoneOffsetMinutes(ms) * MS_PER_MINUTE)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  }
}

/**
 * Swedish wall clock to an absolute instant. The offset depends on the instant
 * we are solving for, so we guess, look up the offset there, and correct once
 * — enough for every case except the hour that DST skips, which has no answer.
 */
export function fromLocal(local: LocalDateTime) {
  const naive = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute
  )

  let ms = naive - timeZoneOffsetMinutes(naive) * MS_PER_MINUTE
  ms = naive - timeZoneOffsetMinutes(ms) * MS_PER_MINUTE
  return ms
}

/** Local noon on a day of the year, used as a stable per-day anchor. */
export function localNoon(year: number, month: number, day: number) {
  return fromLocal({ year, month, day, hour: 12, minute: 0 })
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SWEDEN_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
})

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SWEDEN_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatDate(ms: number) {
  return dateFormatter.format(new Date(ms))
}

export function formatTime(ms: number) {
  return timeFormatter.format(new Date(ms))
}

/** `YYYY-MM-DD`, the value shape of an `<input type="date">`. */
export function toDateInputValue(ms: number) {
  const { year, month, day } = toLocal(ms)
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Whether CEST (summer time) is in effect at an instant. */
export function isSummerTime(ms: number) {
  return timeZoneOffsetMinutes(ms) === 120
}

/** 0-based day index within the local year, for the year slider. */
export function dayOfYear(ms: number) {
  const { year, month, day } = toLocal(ms)
  return Math.round(
    (localNoon(year, month, day) - localNoon(year, 1, 1)) / MS_PER_DAY
  )
}

/** Number of days in a local year (365 or 366). */
export function daysInYear(year: number) {
  return Math.round(
    (localNoon(year + 1, 1, 1) - localNoon(year, 1, 1)) / MS_PER_DAY
  )
}

/** Instant of local noon on day `index` of `year`. */
export function noonOfDayIndex(year: number, index: number) {
  const {
    year: y,
    month,
    day,
  } = toLocal(localNoon(year, 1, 1) + index * MS_PER_DAY)
  return localNoon(y, month, day)
}

export { MS_PER_DAY, MS_PER_HOUR }
