import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// clerkClient reads user metadata via the Clerk backend API (Node runtime).
export const runtime = "nodejs";

export async function GET(req) {
  // Clerk v7 / Next 16: auth() is async and reads the request automatically.
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const plan = new URL(req.url).searchParams.get("plan");
  const isLifetime = plan === "lifetime";
  const priceId = isLifetime
    ? process.env.STRIPE_PRICE_LIFETIME
    : process.env.STRIPE_PRICE_MONTHLY;

  const baseUrl = process.env.NEXT_PUBLIC_URL;

  // Reuse the Stripe customer from a prior purchase when we have one, so a
  // resubscribing user keeps a single customer record (and unified billing
  // history in the portal) instead of spawning a new customer each checkout.
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existingCustomerId = user.publicMetadata?.stripeCustomerId;

  const session = await stripe.checkout.sessions.create({
    mode: isLifetime ? "payment" : "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/?activated=true`,
    cancel_url: `${baseUrl}/`,
    client_reference_id: userId,
    metadata: { clerkUserId: userId },
    ...(existingCustomerId ? { customer: existingCustomerId } : {}),
    // Stamp the Clerk user id onto the subscription too, so later
    // subscription lifecycle events (e.g. cancellation) can resolve the user.
    ...(isLifetime
      ? {}
      : { subscription_data: { metadata: { clerkUserId: userId } } }),
  });

  return Response.redirect(session.url, 303);
}
