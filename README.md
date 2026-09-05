# nuw

**Sun over Sweden** — a small React app that works out how high the sun stands
at a given place, date and time in Sweden, and then finds the moment on the
*other side of the year* when it stands at exactly the same height.

Midsummer is the sun's high point and the December solstice its low point, so
every height in between happens twice a year: once on the way up, once on the
way down. Pick 5 May in Stockholm at noon and the app answers 7 August, 12:08 —
same sun, 94 days later.

## How it finds the twin

Two things have to line up for the sun to repeat a position:

- **Declination** — how far north or south of the equator the sun sits, swinging
  between ±23.44° over a year. It sets how high the whole daily arc rides.
- **Hour angle** — where along that arc the sun currently is, 15° per hour, zero
  at solar noon.

So the app bisects the declination curve to find the twin *date*, then bisects
within that day for the clock time that lands on the same height. Reflecting the
date about the solstice would only get close: Earth moves fastest near perihelion
in early January and slowest near aphelion in July, so the two halves of the year
are not equal.

Positions come from the NOAA solar-position algorithm (a condensed Meeus), with
atmospheric refraction applied near the horizon. Wall clocks are Europe/Stockholm
throughout, DST included.

## The map

A second view shades every point of Sweden by how much sunlight a flat square
metre there is collecting at that instant, driven by the same date and time
sliders. Three separate effects are on show, and they are often muddled
together:

- **Lambert's cosine law** — a beam of fixed width lands on ground stretched by
  1/sin(elevation), so energy per square metre is sin(elevation) of the
  overhead maximum. This is the main reason the north gets less.
- **Air mass** — a low sun also shines through a far longer slab of atmosphere,
  about 38 times the overhead thickness at the horizon, which is what makes it
  dim and red. Shown as a number, not in the shading.
- **Atmospheric refraction** — the actual bending. Denser air near the ground
  curves light downwards so it follows the Earth's curvature a little past the
  geometric horizon, about 34 arcminutes. The rose strip on the map is ground
  lit only by that bend; without an atmosphere it would be dark. At midnight in
  June the strip sits right on the Arctic Circle, which is why the midnight sun
  reaches slightly further south than the geometry allows.

The moving boundary is the **terminator**. Contour lines are exact rather than
traced from the field: points of equal sun height lie on a circle around the
subsolar point, so each contour is one circle projected onto the map.

Sweden's outline is Natural Earth 1:50m, simplified to 322 points and vendored
as a TypeScript module — no map library, no runtime fetch. The projection is a
Lambert conformal conic with standard parallels at 58°N and 66°N.

## Running it

```sh
cd web
pnpm install
pnpm dev
```

`pnpm build` typechecks and bundles, `pnpm lint` runs ESLint.
