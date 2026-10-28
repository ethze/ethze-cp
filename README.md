# ethze-cp

Next.js port of the ethze landing page, including the WebGL logo and the camera hand/eye tracking demo.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- SCSS
- TensorFlow.js
- OpenCV.js

## Setup

```bash
pnpm install
pnpm dev
```

`pnpm install` copies the OpenCV runtime into `public/vendor/`. That folder is generated and ignored by git.

## Build

```bash
pnpm build
pnpm start
```

Hand and face model weights live in `public/models/`, so the app does not fetch models from a CDN at runtime.

The original static page is kept in `reference/index.html` for visual comparison.
