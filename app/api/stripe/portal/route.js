import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";

// clerkClient reads user metadata via the Clerk backend API (Node runtime).
export const runtime = "nodejs";

// Billing portal redirect (step 9). The "Manage subscription" header link is a
// plain navigation to this endpoint, so the Clerk session cookie rides along and
// auth() can identify the user. We look up the Stripe customer id stamped onto
// publicMetadata by the webhook (step 3), open a hosted billing-portal session,
// and 303-redirect the browser to it. Lifetime users land here too — Stripe's
// portal shows their purchase history without a cancel option.
export async function GET() {
  // Instantiate Stripe per-request so the secret isn't required at build time.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const customerId = user.publicMetadata?.stripeCustomerId;

  const baseUrl = process.env.NEXT_PUBLIC_URL;

  // No customer on record (e.g. metadata never set, or a cancelled account that
  // predates Stripe). Nothing to manage — send them back to the app rather than
  // crashing on a billingPortal.sessions.create call with an empty customer.
  if (!customerId) {
    return Response.redirect(baseUrl, 303);
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: baseUrl,
  });

  return Response.redirect(portal.url, 303);
}
