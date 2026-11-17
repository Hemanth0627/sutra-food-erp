# Third-party notices

## Vanta.js

The landing-page hero uses the NET effect from **Vanta.js** (`vanta` npm package, https://github.com/tengbao/vanta), loaded as a dependency and not modified. Sutra passes a small compatibility shim (`VertexColors: true`) because the effect references a constant that newer three.js releases removed.

```
Copyright 2020 Teng Bao

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Fireship three.js scroll animation demo

The scroll-driven 3D story on the landing page is **inspired by** the technique in https://github.com/fireship-io/threejs-scroll-animation-demo: moving a three.js camera from the page's scroll position. That repository has no license file, so **no code or assets were copied** from it. The implementation in `src/components/landing/story-scene.ts` and `scroll-story.tsx` was written independently for this project (procedural geometry, a camera path eased between stations, GSAP ScrollTrigger progress).

## Other open-source packages

The application depends on open-source packages installed through npm, each under its own license (MIT, Apache-2.0, ISC or similar). These include Next.js, React, Prisma, three.js, GSAP, Recharts, Radix UI, Tailwind CSS, Lucide, React Hook Form, Zod, decimal.js, PDFKit, ExcelJS, Sonner, next-themes and the Geist font. See each package in `node_modules` for its license text. GSAP is used under its standard no-charge license.
