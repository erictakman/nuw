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

## Running it

```sh
cd web
pnpm install
pnpm dev
```

`pnpm build` typechecks and bundles, `pnpm lint` runs ESLint.
