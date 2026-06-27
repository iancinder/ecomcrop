# EcomCrop — Product Specification

> **For AI coding assistants:** This document is the single source of truth for building EcomCrop. Read it fully before writing any code. Every architectural decision, feature, and UX behavior is described here. When in doubt, refer back to this spec.

---

## What we're building

EcomCrop is a web app that takes raw product photos and outputs a single `.zip` file containing platform-ready images — correctly sized, smart-cropped, and SEO-renamed — organized into per-platform folders.

The user flow is:
1. Log in or sign up (auth wall — app does not load without a valid session)
2. Drag and drop one or more product photos onto the app
3. Check which platforms to export for (Etsy, Instagram Feed, Instagram Story, TikTok, Pinterest)
4. Type a product keyword (e.g. `handmade leather wallet`)
5. Review and adjust auto-generated crop previews for each image × platform combo
6. Click **Generate zip** — downloads a single `.zip` with organized folders

**Image processing runs entirely client-side. Photos never leave the user's machine. The only server calls are auth token validation and fetching the platform spec file.**

---

## Tech stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | React | Crop preview grid has enough interactive state to warrant it |
| Auth | Clerk | Fastest implementation; handles sessions, JWTs, and user management out of the box |
| Payments | Stripe | Handles both monthly subscriptions and one-time lifetime payments natively |
| Serverless functions | Vercel Functions | 3–4 small functions; no full server needed |
| Image processing | HTML5 Canvas API + Web Workers | Off-main-thread, client-side only |
| Smart cropping | `smartcrop.js` | Client-side content-aware cropping |
| Crop UI override | `cropperjs` | Mature library for draggable/resizable crop boxes |
| Zip generation | `JSZip` + `FileSaver.js` | Virtual directory tree → single download |
| Platform specs | Authenticated remote JSON endpoint | Keeps specs updatable; expired accounts get 401 |

Install:
```bash
npm install @clerk/nextjs stripe smartcrop cropperjs jszip file-saver
```

> **Note:** This spec assumes Next.js (React + Vercel Functions in one project). If you prefer a separate React frontend + standalone serverless backend, the logic is identical — just split the API routes out.

---

## Architecture overview

```
Browser (React app)
  │
  ├── Clerk SDK — manages login/session/JWT automatically
  │
  ├── On app load:
  │     GET /api/specs  (sends Clerk JWT in Authorization header)
  │     → 200 + platform-specs.json  (active subscriber)
  │     → 401 Unauthorized           (expired/cancelled account)
  │
  └── All image processing — Canvas + Web Workers, never leaves browser

Vercel Functions (serverless — no persistent server)
  ├── /api/specs        — validates JWT, returns platform spec JSON
  ├── /api/stripe/checkout  — creates Stripe checkout session
  ├── /api/stripe/webhook   — listens for Stripe payment events, updates user metadata
  └── /api/stripe/portal    — creates Stripe billing portal session (manage/cancel)

Stripe
  ├── Product: "EcomCrop Monthly"   — $X/month recurring
  └── Product: "EcomCrop Lifetime"  — $XX one-time payment
```

---

## Auth (Clerk)

### Setup
- Create a Clerk application at clerk.com
- Add `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to environment variables
- Wrap the React app in `<ClerkProvider>`

### Auth wall
The app must not render at all without a valid Clerk session. Implement this at the root layout level:

```jsx
// app/layout.jsx (Next.js App Router)
import { ClerkProvider } from '@clerk/nextjs'

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html><body>{children}</body></html>
    </ClerkProvider>
  )
}

// app/page.jsx
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'
import App from '@/components/App'

export default function Page() {
  return (
    <>
      <SignedIn><App /></SignedIn>
      <SignedOut>
        <div className="auth-wall">
          <h1>EcomCrop</h1>
          <p>Sign in to access your account.</p>
          <SignInButton />
        </div>
      </SignedOut>
    </>
  )
}
```

### Subscription check
Being logged in is not enough — the user must also have an active subscription. Store subscription status in Clerk's `publicMetadata` on the user object:

```json
{
  "subscriptionStatus": "active",      // "active" | "lifetime" | "cancelled" | "none"
  "stripeCustomerId": "cus_xxx"
}
```

In the React app, after confirming the user is logged in, check their metadata:

```jsx
import { useUser } from '@clerk/nextjs'

function App() {
  const { user } = useUser()
  const status = user?.publicMetadata?.subscriptionStatus

  if (status !== 'active' && status !== 'lifetime') {
    return <SubscribePrompt /> // Show pricing page, not the tool
  }

  return <EcomCropTool />
}
```

---

## Payments (Stripe)

### Products to create in Stripe dashboard
1. **EcomCrop Monthly** — recurring price, e.g. $9/month
2. **EcomCrop Lifetime** — one-time price, e.g. $69

Store the Stripe Price IDs as environment variables:
```
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_LIFETIME=price_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Pricing page / subscribe prompt
Shown to logged-in users who don't have an active subscription. Two options side by side:

- **Monthly plan** — "$9 / month. Cancel anytime." → triggers `/api/stripe/checkout?plan=monthly`
- **Lifetime access** — "$69 once. Yours forever." → triggers `/api/stripe/checkout?plan=lifetime`

### Serverless functions

**`/api/stripe/checkout` — create checkout session**
```js
import Stripe from 'stripe'
import { getAuth } from '@clerk/nextjs/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function GET(req) {
  const { userId } = getAuth(req)
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const plan = new URL(req.url).searchParams.get('plan')
  const priceId = plan === 'lifetime'
    ? process.env.STRIPE_PRICE_LIFETIME
    : process.env.STRIPE_PRICE_MONTHLY

  const session = await stripe.checkout.sessions.create({
    mode: plan === 'lifetime' ? 'payment' : 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_URL}/?activated=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/`,
    metadata: { clerkUserId: userId },
  })

  return Response.redirect(session.url)
}
```

**`/api/stripe/webhook` — handle payment events**

This is the most critical function. Stripe calls this endpoint when payments succeed or subscriptions are cancelled. It updates the user's `publicMetadata` in Clerk accordingly.

```js
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function POST(req) {
  const sig = req.headers.get('stripe-signature')
  const body = await req.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return new Response('Webhook signature invalid', { status: 400 })
  }

  const clerkUserId = event.data.object.metadata?.clerkUserId

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const isLifetime = session.mode === 'payment'
      await clerkClient.users.updateUserMetadata(clerkUserId, {
        publicMetadata: {
          subscriptionStatus: isLifetime ? 'lifetime' : 'active',
          stripeCustomerId: session.customer,
        }
      })
      break
    }
    case 'customer.subscription.deleted': {
      // Subscription cancelled or payment failed
      await clerkClient.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { subscriptionStatus: 'cancelled' }
      })
      break
    }
  }

  return new Response('ok')
}
```

> **Important:** Register this webhook URL in the Stripe dashboard. Listen for `checkout.session.completed` and `customer.subscription.deleted` at minimum.

**`/api/stripe/portal` — billing portal (manage/cancel)**
```js
import Stripe from 'stripe'
import { getAuth } from '@clerk/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function GET(req) {
  const { userId } = getAuth(req)
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const user = await clerkClient.users.getUser(userId)
  const customerId = user.publicMetadata?.stripeCustomerId

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: process.env.NEXT_PUBLIC_URL,
  })

  return Response.redirect(portal.url)
}
```

Add a "Manage subscription" link in the app header that hits this endpoint. Lifetime users see this too — Stripe's portal will show their purchase history but no cancel option.

---

## Platform spec system

**This is critical.** Platform image specs change over time. Do not hardcode dimensions into the app logic.

The spec is fetched from an authenticated endpoint — not a public file. This means expired/cancelled accounts cannot fetch updated specs, which is the subscription's primary enforcement mechanism.

**`/api/specs` — authenticated spec endpoint**
```js
import { getAuth } from '@clerk/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'
import specs from '@/data/platform-specs.json'

export async function GET(req) {
  const { userId } = getAuth(req)
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const user = await clerkClient.users.getUser(userId)
  const status = user.publicMetadata?.subscriptionStatus

  if (status !== 'active' && status !== 'lifetime') {
    return new Response('Subscription required', { status: 401 })
  }

  return Response.json(specs)
}
```

The React app calls this on load (after confirming the user is logged in). If it gets a 401, show the subscribe prompt. If the fetch fails entirely (offline), fall back to the bundled spec file.

### `platform-specs.json` structure

```json
{
  "version": "1.0.0",
  "last_updated": "2025-06-01",
  "platforms": [
    {
      "id": "etsy_listing",
      "label": "Etsy listing",
      "width": 2000,
      "height": 2000,
      "aspect_ratio": "1:1",
      "format": "jpg",
      "quality": 0.92,
      "folder": "Etsy",
      "filename_suffix": "etsy"
    },
    {
      "id": "instagram_feed",
      "label": "Instagram feed",
      "width": 1080,
      "height": 1080,
      "aspect_ratio": "1:1",
      "format": "jpg",
      "quality": 0.90,
      "folder": "Instagram/Feed",
      "filename_suffix": "ig-feed"
    },
    {
      "id": "instagram_story",
      "label": "Instagram story",
      "width": 1080,
      "height": 1920,
      "aspect_ratio": "9:16",
      "format": "jpg",
      "quality": 0.90,
      "folder": "Instagram/Story",
      "filename_suffix": "ig-story"
    },
    {
      "id": "tiktok",
      "label": "TikTok",
      "width": 1080,
      "height": 1920,
      "aspect_ratio": "9:16",
      "format": "jpg",
      "quality": 0.88,
      "folder": "TikTok",
      "filename_suffix": "tiktok"
    },
    {
      "id": "pinterest",
      "label": "Pinterest",
      "width": 1000,
      "height": 1500,
      "aspect_ratio": "2:3",
      "format": "jpg",
      "quality": 0.90,
      "folder": "Pinterest",
      "filename_suffix": "pinterest"
    }
  ]
}
```

The app reads this schema at runtime. Adding a new platform requires only updating the JSON — no code changes.

---

## Feature specifications

### 1. Drag-and-drop photo intake

- Accept: `image/jpeg`, `image/png`, `image/webp`
- Multiple files at once
- Show thumbnail grid of accepted photos
- Allow removing individual photos before processing
- No file size limit (processed locally — files never leave the browser)

### 2. Platform selector

- Render one checkbox per platform from the loaded spec JSON
- Default: all platforms checked
- Each checkbox shows the platform label and aspect ratio
- Selecting/deselecting updates the crop preview panel in real time

### 3. SEO renaming

- Single text input: "Product keyword"
- Placeholder: `e.g. handmade leather wallet`
- Output filename pattern: `{keyword-slugified}-{platform_suffix}-{zero-padded-index}.jpg`
- Example: `handmade-leather-wallet-etsy-01.jpg`
- Slugify: lowercase, spaces → hyphens, strip special characters
- Index resets per platform folder (01, 02, 03...)

### 4. Smart crop + manual override (critical feature)

This is the most important UX feature. Auto-cropping fails on flat lays, tall/narrow products, and light backgrounds. Users must be able to correct it before generating.

**Auto-crop behavior:**
- Run `smartcrop.js` on each image for each selected platform's aspect ratio
- `smartcrop.js` returns a `{x, y, width, height}` crop box
- Use that as the initial crop region

**Crop preview UI:**
- After photos are uploaded and platforms are selected, show a preview grid
- Grid rows = photos, grid columns = selected platforms
- Each cell shows the image with the crop region overlaid as a draggable/resizable box (use `cropperjs` with aspect ratio locked to the platform's ratio)
- User can drag to reposition, resize within aspect ratio constraints
- Changes in one cell do not affect other cells (each photo × platform combo is independent)
- A "Reset crop" button per cell re-runs smartcrop for that combo

**Implementation notes:**
- Do not run the full export until the user clicks Generate — previews are only for adjustment
- `cropperjs` docs: https://github.com/fengyuanchen/cropperjs

### 5. Web Worker processing

Wrap all canvas image processing in a Web Worker to keep the UI responsive during generation.

Worker receives: `{ imageDataUrl, cropBox: {x, y, width, height}, targetWidth, targetHeight, quality, format }`

Worker returns: a `Blob` of the processed image

```js
// cropWorker.js
self.onmessage = async ({ data }) => {
  const { imageDataUrl, cropBox, targetWidth, targetHeight, quality } = data
  const bitmap = await createImageBitmap(await fetch(imageDataUrl).then(r => r.blob()))
  const canvas = new OffscreenCanvas(targetWidth, targetHeight)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, cropBox.x, cropBox.y, cropBox.width, cropBox.height, 0, 0, targetWidth, targetHeight)
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  self.postMessage({ blob })
}
```

### 6. Zip generation and download

Once all Worker jobs complete:

1. Instantiate a `JSZip` instance
2. For each processed blob, add it at: `{platform.folder}/{seo-filename}`
   - Example: `Etsy/handmade-leather-wallet-etsy-01.jpg`
3. Generate with `zip.generateAsync({ type: 'blob' })`
4. Trigger download with `FileSaver.saveAs(blob, 'ecomcrop-export.zip')`

Show a progress indicator during generation (can take 2–5s for many large images).

### 7. Custom platform support

Below the platform checkboxes, an **"Add custom platform"** button opens an inline form:

Fields: Label (text), Width (px), Height (px), Folder name (text)

Custom platforms appear in the checkbox list and behave identically to built-in platforms (including crop preview). Stored in `localStorage`, persist across sessions. Not synced to the server.

---

## UX states to handle

| State | Behavior |
|---|---|
| Not logged in | Show auth wall with sign in / sign up. App does not render. |
| Logged in, no subscription | Show pricing page with monthly + lifetime options. App does not render. |
| Logged in, subscription active | App renders normally. |
| Spec fetch returns 401 | Treat as expired subscription — show "Resubscribe" prompt. |
| Spec fetch fails (offline) | Silently fall back to bundled spec. No error shown. |
| No photos uploaded | Show drop zone, disable Generate button. |
| Photos uploaded, no platforms selected | Show warning, disable Generate button. |
| No keyword entered | Allow generation, use `product` as slug fallback. |
| Worker throws on an image | Skip that image, show "1 image failed to process" toast. |
| Zip generation in progress | Show progress bar, disable Generate button. |
| Done | Auto-trigger download, show "Done! Check your Downloads folder." |
| `?activated=true` in URL (post-Stripe redirect) | Show "Welcome! Your account is active." toast, strip param from URL. |

---

## Environment variables

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_xxx
CLERK_SECRET_KEY=sk_xxx

# Stripe
STRIPE_SECRET_KEY=sk_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_LIFETIME=price_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# App
NEXT_PUBLIC_URL=https://ecomcrop.com   # or http://localhost:3000 in dev
```

---

## File/folder structure

```
ecomcrop/
├── app/
│   ├── layout.jsx                  # ClerkProvider wrapper
│   ├── page.jsx                    # Auth wall + app entry
│   └── api/
│       ├── specs/route.js          # Authenticated spec endpoint
│       └── stripe/
│           ├── checkout/route.js   # Create Stripe checkout session
│           ├── webhook/route.js    # Handle Stripe payment events
│           └── portal/route.js     # Billing portal redirect
├── components/
│   ├── App.jsx                     # Main app (rendered only when authed + subscribed)
│   ├── SubscribePrompt.jsx         # Pricing page shown to unsubscribed users
│   ├── DropZone.jsx
│   ├── PlatformSelector.jsx
│   ├── KeywordInput.jsx
│   ├── CropPreviewGrid.jsx         # Photo × platform preview matrix
│   ├── CropPreviewCell.jsx         # Single cropperjs instance per combo
│   └── GenerateButton.jsx
├── lib/
│   ├── specLoader.js               # Fetches /api/specs, falls back to bundled
│   ├── smartCropAdapter.js         # Wraps smartcrop.js → {x,y,w,h}
│   ├── zipBuilder.js               # JSZip orchestration
│   └── slugify.js                  # Keyword → filename slug
├── workers/
│   └── cropWorker.js               # Web Worker for canvas processing
├── data/
│   └── platform-specs.json         # Bundled fallback spec
└── public/
```

---

## What this is NOT

- Not a cloud image processor — photos never leave the browser
- Not a photo editor — no filters, adjustments, or color correction
- Not a social scheduler — no posting to platforms directly
- Not a full backend app — 4 serverless functions is the entire server footprint

---

## Build order (recommended)

Build in this sequence to avoid getting blocked:

1. Scaffold Next.js project, install dependencies
2. Set up Clerk — get auth wall working with sign in/out
3. Set up Stripe products + `/api/stripe/checkout` + `/api/stripe/webhook` — get a test subscription activating a user's metadata
4. Build `/api/specs` + `specLoader.js` — confirm active users get specs, others get 401
5. Build `DropZone` + `PlatformSelector` + `KeywordInput` — basic UI shell
6. Build `CropPreviewGrid` + `CropPreviewCell` with `cropperjs` — this is the hardest UI component
7. Build `cropWorker.js` + `zipBuilder.js` — wire up generation and download
8. Add `SubscribePrompt` with both pricing options
9. Add "Manage subscription" link → `/api/stripe/portal`
10. Add custom platform support
11. Test the full cancel → resubscribe flow end to end
