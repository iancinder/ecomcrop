import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import App from "@/components/App";

export default function Page() {
  return (
    <>
      <Show when="signed-in">
        <App />
      </Show>
      <Show when="signed-out">
        <div className="auth-wall">
          <h1 className="auth-wall__title">EcomCrop</h1>
          <p className="auth-wall__subtitle">
            Turn raw product photos into platform-ready images. Sign in to
            access your account.
          </p>
          <div className="auth-wall__actions">
            <SignInButton mode="modal">
              <button className="btn btn--primary">Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="btn btn--secondary">Create account</button>
            </SignUpButton>
          </div>
        </div>
      </Show>
    </>
  );
}
