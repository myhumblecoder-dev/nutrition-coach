import { signIn } from "@/auth";

async function SignInAction({ provider }: { provider: "google" | "apple" | "github" }) {
  "use server";
  await signIn(provider);
}

function ProviderForm({ provider, children, className }: { provider: "google" | "apple" | "github"; children: React.ReactNode; className?: string }) {
  return (
    <form action={async () => { "use server"; await signIn(provider); }} className={className}>
      {children}
    </form>
  );
}

export function SignInButtons() {
  return (
    <div className="flex flex-col gap-4 w-full max-w-sm mx-auto">
      <ProviderForm provider="google">
        <button
          type="submit"
          aria-label="Sign in with Google"
          className="flex items-center justify-center w-full h-[40px] bg-white border border-[#747775] text-[#1f1f1f] rounded-md"
        >
          <svg className="w-5 h-5" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.35 30.47 0 24 0 16.46 0 9.9나 5.35 5.84 12.85l7.15 5.53c1.51-8.53 9.11-14.75 18.01-14.75z" />
            <path fill="#4285F4" d="M24 24c4.76 0 8.77 1.62 11.71 4.43l8.53-8.53C35.9 5.35 30.47 0 24 0 13.95 0 5.35 5.35 2.42 13.5l7.15 5.53c1.48-7.05 8.12-12.1 14.44-12.1z" />
            <path fill="#FBBC05" d="M5.84 22.35c-.48-1.45-.76-2.99-.76-4.6 0-1.61.28-3.15.76-4.6L2.42 13.5C.85 16.85 0 20.45 0 24c0 3.55.85 7.15 2.42 10.5l7.15-5.53c-.39-1.17-.63-2.41-.63-3.87 0-1.46.28-2.91.76-4.27z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.96-2.81 15.89-7.85l-7.15-5.53c-2.13 1.44-4.83 2.25-7.74 2.25-5.35 0-9.9-3.55-11.71-8.43l-7.15 5.53C5.35 42.65 13.95 48 24 48z" />
            <path fill="#4285F4" d="M24 48c4.76 0 8.77-1.62 11.71-4.43l-8.53-8.53C27.77 38.38 25.84 39 24 39c-5.45 0-10.44-3.55-11.71-8.43l-7.15 5.53C5.35 35.9 0 39.45 0 45c0-3.55.85-7.15 2.42-10.5z" />
          </svg>
        </button>
      </ProviderForm>

      <ProviderForm provider="apple">
        <button
          type="submit"
          aria-label="Sign in with Apple"
          className="flex items-center justify-center w-full h-[44px] bg-black text-white rounded-md"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.05 20.28c-.98.95-2.05 1.72-3.1 1.72-1.05 0-1.4-.65-2.63-.65-1.23 0-1.6.65-2.63.65-1.05 0-2.12-.77-3.1-1.72C3.5 18.36 2.7 14.8 2.7 11.2c0-3.6 2.3-5.5 4.5-5.5 1.1 0 2 .65 2.7 0.65.7 0 1.6-.65 2.7-.65 1.1 0 2.5.5 3.6 1.6-2.8 1.5-2.3 5.3 0 6.8-.8 1.1-1.8 2.1-3 2.1zM12 7.5c0-2.5 2-4.5 4.5-4.5 2.5 0 4.5 2 4.5 4.5 0 2.5-2 4.5-4.5 4.5-2.5 0-4.5-2-4.5-4.5z" />
          </svg>
        </button>
      </ProviderForm>

      <div className="relative flex items-center py-2">
        <div className="flex-grow border-t border-gray-300"></div>
        <span className="flex-shrink mx-4 text-gray-400 text-sm">or</span>
        <div className="flex-grow border-t border-gray-300"></div>
      </div>

      <ProviderForm provider="github">
        <button
          type="submit"
          aria-label="Continue with GitHub"
          className="text-sm text-gray-600 hover:text-black transition-colors"
        >
          Continue with GitHub
        </button>
      </ProviderForm>
    </div>
  );
}

export default SignInButtons;