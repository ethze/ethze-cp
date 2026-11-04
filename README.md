# ethze-cp

Next.js port of the ethze landing page, including the WebGL logo and the camera hand/eye tracking demo.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- SCSS
- MediaPipe
- OpenCV.js

## Setup

```bash
pnpm install
pnpm dev
```

`pnpm install` copies the OpenCV and MediaPipe runtimes into `public/vendor/`. That folder is generated and ignored by git.

## Build

```bash
pnpm build
pnpm start
```

The original static page is kept in `reference/index.html` for visual comparison.
