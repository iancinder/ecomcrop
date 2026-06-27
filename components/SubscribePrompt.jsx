"use client";

// Pricing page shown to logged-in users without an active subscription (step 8).
//
// Both CTAs are plain links to the authenticated checkout endpoint. That GET
// handler creates a Stripe Checkout session and responds with a 303 redirect to
// Stripe's hosted page; the Clerk session cookie rides along on the navigation,
// so the handler can identify the user. On success Stripe returns the user to
// `/?activated=true` (handled in App).
//
// `resubscribe` tweaks the copy for accounts whose subscription has lapsed.
export default function SubscribePrompt({ resubscribe = false }) {
  return (
    <main className="subscribe">
      <div className="subscribe__intro">
        <h1 className="subscribe__title">
          {resubscribe ? "Your subscription has lapsed" : "Choose your plan"}
        </h1>
        <p className="subscribe__subtitle">
          {resubscribe
            ? "Reactivate to keep turning product photos into platform-ready exports."
            : "Unlock unlimited smart-cropped, platform-ready image exports."}
        </p>
      </div>

      <div className="plans">
        <section className="plan">
          <h2 className="plan__name">Monthly</h2>
          <p className="plan__price">
            <span className="plan__amount">$9</span>
            <span className="plan__period"> / month</span>
          </p>
          <p className="plan__tagline">Cancel anytime.</p>
          <a
            className="btn btn--secondary plan__cta"
            href="/api/stripe/checkout?plan=monthly"
          >
            Choose monthly
          </a>
        </section>

        <section className="plan plan--featured">
          <span className="plan__badge">Best value</span>
          <h2 className="plan__name">Lifetime</h2>
          <p className="plan__price">
            <span className="plan__amount">$69</span>
            <span className="plan__period"> once</span>
          </p>
          <p className="plan__tagline">Yours forever.</p>
          <a
            className="btn btn--primary plan__cta"
            href="/api/stripe/checkout?plan=lifetime"
          >
            Get lifetime access
          </a>
        </section>
      </div>
    </main>
  );
}
