import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

// Stripe signature verification needs Node's crypto + the raw request body.
export const runtime = "nodejs";

export async function POST(req) {
  // Instantiate Stripe per-request so the secret isn't required at build time.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return new Response("Webhook signature invalid", { status: 400 });
  }

  const object = event.data.object;
  const clerkUserId = object.metadata?.clerkUserId;

  switch (event.type) {
    case "checkout.session.completed": {
      if (!clerkUserId) break;
      const isLifetime = object.mode === "payment";
      const client = await clerkClient();
      await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: {
          subscriptionStatus: isLifetime ? "lifetime" : "active",
          stripeCustomerId: object.customer,
        },
      });
      break;
    }
    case "customer.subscription.deleted": {
      // Subscription cancelled or payment failed.
      if (!clerkUserId) break;
      const client = await clerkClient();
      await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { subscriptionStatus: "cancelled" },
      });
      break;
    }
    default:
      break;
  }

  return new Response("ok");
}
