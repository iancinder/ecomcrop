import { auth, clerkClient } from "@clerk/nextjs/server";
import specs from "@/data/platform-specs.json";

// clerkClient reads user metadata via the Clerk backend API (Node runtime).
export const runtime = "nodejs";

// Authenticated platform-spec endpoint. This is the subscription's primary
// enforcement mechanism: only active/lifetime users can fetch the (updatable)
// specs. Everyone else gets a 401 so the client shows the resubscribe prompt.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const status = user.publicMetadata?.subscriptionStatus;

  if (status !== "active" && status !== "lifetime") {
    return new Response("Subscription required", { status: 401 });
  }

  return Response.json(specs);
}
