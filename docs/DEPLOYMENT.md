# EcomCrop — Deployment & Production Runbook

> **For AI coding assistants:** This document is the deployment checklist for moving EcomCrop from a local development environment to a live production environment on Vercel. Execute the "Code & Terminal Actions" when prompted. Leave the "Human Actions" for the developer.

---

## Phase 1: Codebase Preparation (Cursor Action)

**AI Assistant Instructions:** 
1. Audit the `/api/stripe/webhook/route.js` file. Ensure it is not using any hardcoded `localhost` URLs and relies strictly on `process.env.NEXT_PUBLIC_URL`.
2. Create a `.env.example` file in the root directory that lists all required Clerk and Stripe keys (leave the values blank) so the human knows exactly what to paste into Vercel.
3. Ensure `.env` and `.env.local` are safely inside the `.gitignore` file.
4. Initialize a git repository, commit all files with the message "Ready for production", and push to the user's remote GitHub repository.

---

## Phase 2: Host Provisioning (Human Action)

**Human Instructions:**
1. Go to [Vercel.com](https://vercel.com) and log in with your GitHub account.
2. Click **Add New Project** and import the `ecomcrop` repository.
3. Do NOT click deploy yet. Leave this tab open.

---

## Phase 3: Live Key Generation (Human Action)

**Human Instructions:**
1. **Stripe:** Log into the Stripe Dashboard. Toggle "Test mode" to **OFF** (top right corner). 
2. Re-create your two products in live mode: "EcomCrop Monthly" and "EcomCrop Lifetime". 
3. Copy the two new Live Price IDs. 
4. Copy your Live Secret Key and Live Publishable Key.
5. **Clerk:** Log into the Clerk Dashboard. Switch from "Development" to "Production".
6. Copy your Live Publishable Key and Live Secret Key.

---

## Phase 4: Webhook Re-Routing (Human Action)

**Human Instructions:**
1. In your live Stripe Dashboard, navigate to **Developers > Webhooks**.
2. Click **Add Endpoint**. 
3. Set the Endpoint URL to: `https://[YOUR-VERCEL-DOMAIN].vercel.app/api/stripe/webhook`
4. Select events to listen to: `checkout.session.completed` and `customer.subscription.deleted`.
5. Click Add Endpoint, then reveal and copy the new **Live Webhook Secret**.

---

## Phase 5: Environment Injection (Human Action)

**Human Instructions:**
1. Go back to your open Vercel tab. 
2. Open the **Environment Variables** dropdown.
3. Add the following keys using the Live data you just generated:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_MONTHLY`
   - `STRIPE_PRICE_LIFETIME`
   - `NEXT_PUBLIC_URL` (Set this to your Vercel domain initially, update it later when you buy a custom domain).
4. Click **Deploy**. Vercel will now build the app using your live keys.

---

## Phase 6: DNS and Custom Domain (Human Action)

**Human Instructions:**
1. Buy your domain (e.g., ecomcrop.com).
2. In Vercel, go to your project **Settings > Domains** and add your custom domain.
3. Copy the provided A Record and CNAME, and paste them into your domain registrar's DNS settings.
4. In Clerk, go to **Domains**, add your custom domain, and copy the two CNAME records they provide into your DNS settings to ensure logins work securely on your live site.
5. Update your `NEXT_PUBLIC_URL` environment variable in Vercel to your new custom domain and trigger one final redeploy.