import * as React from "react"

import { solarPosition, sunAngles, type Coordinates } from "@/lib/solar"
import {
  buildLightGrid,
  paintLightField,
  type LightGrid,
} from "@/lib/light-field"
import {
  add,
  createCamera,
  cross,
  dot,
  fromLatLon,
  normalize,
  scale,
  sunDirection,
  type Vec3,
} from "@/lib/globe"
import { SWEDEN_RINGS } from "@/lib/sweden"
import { SWEDISH_PLACES } from "@/lib/places"

const WIDTH = 560
const HEIGHT = 400

/** The shaded surface is smooth, so a coarse lattice upscales cleanly. */
const FIELD_WIDTH = 224
const FIELD_HEIGHT = 160

/** How far back along a beam the visibility test walks, in Earth radii. */
const RAY_LENGTH = 0.42
/** Drawn length of a full-strength beam, in drawing units. */
const RAY_SCREEN_LENGTH = 150
/** Drawing units of footprint for a beam arriving dead square, and the cap. */
const FOOTPRINT_UNIT = 13
const FOOTPRINT_MAX = 170

/**
 * Sunlight arrives parallel, but a perspective camera makes parallel lines
 * converge on a vanishing point — draw beams right across the hemisphere and
 * they fan out like a lamp instead. Keeping to the patch around Sweden holds
 * the convergence below what the eye picks up, so the beams read as what they
 * are.
 */
const PATCH_CENTRE = fromLatLon(62.5, 16)
/** Rings of landing points around that centre, in degrees of arc. */
const PATCH_RING_SPACING = 5
const PATCH_RINGS = 5

const camera = createCamera(WIDTH, HEIGHT)

/** Three latitudes far enough apart for the cosine effect to be obvious. */
const BEAM_PLACES = ["Kiruna", "Östersund", "Malmö"].map((name) =>
  SWEDISH_PLACES.find((place) => place.name === name)!
)

type Point = { x: number; y: number }

function path(points: Point[]) {
  return (
    "M" + points.map(({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")
  )
}

/**
 * Split a run of surface points into the stretches that are actually facing
 * the camera, so a line drawn on the globe stops at the horizon instead of
 * wrapping around the back.
 */
function facingSegments(points: Vec3[]) {
  const segments: Point[][] = []
  let current: Point[] = []

  for (const point of points) {
    const projected = camera.facing(point) ? camera.project(point) : null
    if (!projected) {
      if (current.length > 1) {
        segments.push(current)
      }
      current = []
      continue
    }
    current.push(projected)
  }

  if (current.length > 1) {
    segments.push(current)
  }
  return segments
}

/**
 * How far a sunbeam travels before the globe hides it. The beam arrives along
 * -sun, so we walk back from the point it strikes until the line of sight to
 * the lens is blocked.
 */
function visibleRayLength(hit: Vec3, sun: Vec3) {
  const steps = 20
  let length = 0
  for (let i = 1; i <= steps; i++) {
    const distance = (i / steps) * RAY_LENGTH
    const point = add(hit, scale(sun, distance))
    // Stop at whichever comes first: the globe cutting the line of sight, or
    // the beam running back past the lens, where there is nothing to draw.
    if (!camera.unobstructed(point) || !camera.project(point)) {
      break
    }
    length = distance
  }
  return length
}

type Ray = { from: Point; to: Point }

/**
 * Sunlight arrives parallel. A perspective camera would draw it converging on a
 * vanishing point, which reads as a lamp rather than a star eight light-minutes
 * away, so the beams share one screen direction — measured from the middle of
 * the patch — while still ending exactly where they land. How far each one is
 * drawn still comes from the real geometry: a beam that the globe cuts off
 * early is drawn short, and one it hides entirely is not drawn at all.
 */
function buildRay(hit: Vec3, sun: Vec3, heading: Point): Ray | null {
  if (!camera.facing(hit) || !camera.unobstructed(hit)) {
    return null
  }

  const length = visibleRayLength(hit, sun)
  if (length <= 0) {
    return null
  }

  const to = camera.project(hit)
  if (!to) {
    return null
  }

  // Grazing beams skim behind the horizon almost at once. Draw them at least
  // partly rather than as invisible stubs; how many there are is the signal
  // that matters, not how long each one is.
  const drawn =
    RAY_SCREEN_LENGTH * Math.max(0.6, Math.min(1, length / RAY_LENGTH))
  return {
    from: { x: to.x - heading.x * drawn, y: to.y - heading.y * drawn },
    to,
  }
}

/** Which way the beams run across the picture, taken at the patch centre. */
function beamHeading(sun: Vec3): Point | null {
  const landing = camera.project(PATCH_CENTRE)
  const back = camera.project(add(PATCH_CENTRE, scale(sun, 0.2)))
  if (!landing || !back) {
    return null
  }
  const dx = landing.x - back.x
  const dy = landing.y - back.y
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

/**
 * Where to land the drawn beams: rings spread evenly across the ground around
 * Sweden. Sampling the incoming beam instead would be tempting — the beams
 * that reach a given patch thin out with a low sun, which is the cosine law
 * over again — but it leaves a midwinter noon with barely a line on screen,
 * and the footprints already carry that comparison.
 */
function landingPoints(): Vec3[] {
  const east = normalize(cross([0, 0, 1], PATCH_CENTRE))
  const north = cross(PATCH_CENTRE, east)
  const points: Vec3[] = [PATCH_CENTRE]

  for (let ring = 1; ring <= PATCH_RINGS; ring++) {
    const radius = (ring * PATCH_RING_SPACING * Math.PI) / 180
    const count = Math.round(2 * Math.PI * ring)
    for (let step = 0; step < count; step++) {
      const azimuth = (step / count) * 2 * Math.PI
      points.push(
        normalize(
          add(
            scale(PATCH_CENTRE, Math.cos(radius)),
            scale(
              add(
                scale(east, Math.cos(azimuth)),
                scale(north, Math.sin(azimuth))
              ),
              Math.sin(radius)
            )
          )
        )
      )
    }
  }

  return points
}

const LANDING_POINTS = landingPoints()

/**
 * The camera is fixed, so the graticule and the coastline are the same picture
 * on every frame. Building them once keeps the per-frame work down to the sun.
 */
const GRATICULE = [
  ...[40, 50, 60, 70, 80].map((latitude) =>
    Array.from({ length: 61 }, (_, index) =>
      fromLatLon(latitude, -30 + index * 1.5)
    )
  ),
  ...[-15, 0, 15, 30, 45].map((longitude) =>
    Array.from({ length: 41 }, (_, index) =>
      fromLatLon(30 + index * 1.5, longitude)
    )
  ),
].flatMap((line) => facingSegments(line))

const OUTLINE = SWEDEN_RINGS.flatMap((ring) =>
  facingSegments(
    ring.map(([longitude, latitude]) => fromLatLon(latitude, longitude))
  )
)

type GlobeRaysProps = {
  instant: number
  coords: Coordinates
}

export function GlobeRays({ instant, coords }: GlobeRaysProps) {
  // The graticule and the coastline never move, so they are rendered once and
  // reused: at a hundred-odd nodes they cost more to diff than to draw.
  const staticLayers = React.useMemo(
    () => (
      <>
        {GRATICULE.map((segment, index) => (
          <path
            key={`graticule-${index}`}
            d={path(segment)}
            fill="none"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={0.6}
          />
        ))}
        {OUTLINE.map((segment, index) => (
          <path
            key={`outline-${index}`}
            d={path(segment)}
            fill="none"
            stroke="rgba(20,16,10,0.75)"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        ))}
      </>
    ),
    []
  )

  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const gridRef = React.useRef<LightGrid | null>(null)
  const bufferRef = React.useRef<HTMLCanvasElement | null>(null)
  const imageRef = React.useRef<ImageData | null>(null)

  const { declination, equationOfTime } = sunAngles(instant)
  const minutesUtc =
    (((instant % 86_400_000) + 86_400_000) % 86_400_000) / 60_000
  const baseHourAngle = (minutesUtc + equationOfTime) / 4 - 180
  const subsolarLongitude = -(((baseHourAngle + 540) % 360) - 180)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    if (!gridRef.current) {
      // Cast every pixel of the lattice out through the lens once and record
      // where it lands on the globe; the camera never moves after that.
      gridRef.current = buildLightGrid(FIELD_WIDTH, FIELD_HEIGHT, (u, v) => {
        const surface = camera.surfaceAt(u, v)
        if (!surface) {
          return null
        }
        return [
          (Math.atan2(surface[1], surface[0]) * 180) / Math.PI,
          (Math.asin(surface[2]) * 180) / Math.PI,
        ]
      })
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
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(buffer, 0, 0, WIDTH, HEIGHT)
  }, [declination, baseHourAngle])

  const sun = sunDirection(declination, subsolarLongitude)

  // An orthonormal frame across the incoming beam. Offsets inside the unit
  // circle of this frame are exactly the sunbeams that strike the Earth.
  const helper: Vec3 = Math.abs(sun[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]
  const across = normalize(cross(sun, helper))
  const up = normalize(cross(sun, across))

  const heading = beamHeading(sun)
  const rays: Ray[] = []
  if (heading) {
    for (const landing of LANDING_POINTS) {
      if (dot(landing, sun) <= 0) {
        continue
      }
      const ray = buildRay(landing, sun, heading)
      if (ray) {
        rays.push(ray)
      }
    }
  }

  // The terminator: the great circle where the sunlight arrives edge on.
  const terminator = facingSegments(
    Array.from({ length: 181 }, (_, index) => {
      const angle = (index / 180) * 2 * Math.PI
      return add(
        scale(across, Math.cos(angle)),
        scale(up, Math.sin(angle))
      ) as Vec3
    })
  )

  // Footprints are drawn to scale with each other rather than in true
  // perspective. A beam that lands 300 km nearer the lens projects longer for
  // reasons that have nothing to do with the sun, which would leave Malmö's
  // ×1.2 patch looking bigger than Kiruna's ×1.4. Anchoring each bar at its
  // city and sizing it by 1/sin(elevation) keeps the one comparison the
  // picture exists to make.
  const beams = BEAM_PLACES.map((place) => {
    const point = fromLatLon(place.latitude, place.longitude)
    const elevation = solarPosition(instant, place).elevation
    const sine = Math.sin((elevation * Math.PI) / 180)
    const centre = camera.facing(point) ? camera.project(point) : null

    if (!centre || sine <= 0 || !heading) {
      return {
        place,
        elevation,
        centre,
        bar: null,
        edges: [] as Ray[],
        stretch: null,
      }
    }

    // Along the ground, directly away from the point with the sun overhead:
    // the direction the beam is smeared in.
    const away = normalize(add(scale(sun, -1), scale(point, dot(point, sun))))
    const nearby = normalize(add(point, scale(away, 0.02)))
    const projectedNearby = camera.project(nearby)
    if (!projectedNearby) {
      return {
        place,
        elevation,
        centre,
        bar: null,
        edges: [] as Ray[],
        stretch: null,
      }
    }

    const dx = projectedNearby.x - centre.x
    const dy = projectedNearby.y - centre.y
    const span = Math.hypot(dx, dy) || 1
    const direction = { x: dx / span, y: dy / span }

    const stretch = 1 / sine
    const drawn = Math.min(FOOTPRINT_UNIT * stretch, FOOTPRINT_MAX)
    const bar: [Point, Point] = [
      {
        x: centre.x - (direction.x * drawn) / 2,
        y: centre.y - (direction.y * drawn) / 2,
      },
      {
        x: centre.x + (direction.x * drawn) / 2,
        y: centre.y + (direction.y * drawn) / 2,
      },
    ]

    // The two beam edges land on the ends of the footprint.
    const edges: Ray[] = bar.map((end) => ({
      from: {
        x: end.x - heading.x * RAY_SCREEN_LENGTH,
        y: end.y - heading.y * RAY_SCREEN_LENGTH,
      },
      to: end,
    }))

    return { place, elevation, centre, bar, edges, stretch }
  })

  const herePoint = fromLatLon(coords.latitude, coords.longitude)
  const here = camera.facing(herePoint) ? camera.project(herePoint) : null
  const anyLit = beams.some((beam) => beam.bar !== null)

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-[oklch(0.16_0.02_265)]"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Sweden drawn on the curved Earth with sunbeams striking it"
        >
          {staticLayers}

          {terminator.map((segment, index) => (
            <path
              key={`terminator-${index}`}
              d={path(segment)}
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ))}

          {/* Every beam carries the same energy; only the footprint changes. */}
          {rays.map((ray, index) => (
            <line
              key={`ray-${index}`}
              x1={ray.from.x}
              y1={ray.from.y}
              x2={ray.to.x}
              y2={ray.to.y}
              stroke="rgba(255,176,66,0.75)"
              strokeWidth={1.1}
            />
          ))}

          {beams.map((beam) => (
            <g key={beam.place.name}>
              {beam.edges.map((edge, index) => (
                <line
                  key={index}
                  x1={edge.from.x}
                  y1={edge.from.y}
                  x2={edge.to.x}
                  y2={edge.to.y}
                  stroke="rgba(255,238,180,0.95)"
                  strokeWidth={2}
                />
              ))}
              {beam.bar ? (
                <line
                  x1={beam.bar[0].x}
                  y1={beam.bar[0].y}
                  x2={beam.bar[1].x}
                  y2={beam.bar[1].y}
                  stroke="oklch(0.66 0.21 22)"
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              ) : null}
            </g>
          ))}

          {beams.map((beam) => {
            const projected = beam.centre
            if (!projected) {
              return null
            }
            return (
              <g key={`label-${beam.place.name}`}>
                <circle
                  cx={projected.x}
                  cy={projected.y}
                  r={2}
                  fill="rgba(20,16,10,0.8)"
                />
                <text
                  x={projected.x + 7}
                  y={projected.y + 3}
                  className="text-[10px]"
                  fill="rgba(255,255,255,0.92)"
                  style={{
                    paintOrder: "stroke",
                    stroke: "rgba(20,18,30,0.65)",
                    strokeWidth: 3,
                  }}
                >
                  {beam.place.name} {beam.elevation.toFixed(0)}°
                  {beam.stretch ? ` · ×${beam.stretch.toFixed(1)}` : ""}
                </text>
              </g>
            )
          })}

          {here ? (
            <circle
              cx={here.x}
              cy={here.y}
              r={4}
              className="fill-sun"
              stroke="rgba(20,16,10,0.85)"
              strokeWidth={1.5}
            />
          ) : null}
        </svg>
      </div>

      <p className="text-xs text-muted-foreground">
        {anyLit
          ? "Each thin line is a sunbeam of the same width, arriving parallel. The red bar is the ground a single beam has to cover — short where the sun is high, stretched out where it grazes."
          : rays.length > 0
            ? "Sweden itself has gone past the day-night line. The beams still landing are falling further north, where the sun has not set."
            : "The sun is round the other side: no beam reaches this face of the Earth."}
      </p>
    </div>
  )
}
