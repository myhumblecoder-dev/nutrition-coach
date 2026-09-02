import { signIn } from "@/auth";

function ProviderForm({ provider, children }: { provider: "google" | "apple" | "github"; children: React.ReactNode }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn(provider);
      }}
    >
      {children}
    </form>
  );
}

// Official Google "G" mark — required verbatim by the Sign in with Google
// brand guidelines (no recoloring, no monochrome variant on a button).
function GoogleMark() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <path fill="#FBBC05" d="M3.9641 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z" />
      <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4636.8918 11.4264 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.031 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.702" />
    </svg>
  );
}

export function SignInButtons() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
      <ProviderForm provider="google">
        <button
          type="submit"
          className="flex h-[40px] w-full items-center justify-center gap-3 rounded-md border border-[#747775] bg-white text-sm font-medium text-[#1f1f1f] hover:bg-[#f8f9fa]"
        >
          <GoogleMark />
          Sign in with Google
        </button>
      </ProviderForm>

      <ProviderForm provider="apple">
        <button
          type="submit"
          className="flex h-[44px] w-full items-center justify-center gap-3 rounded-md bg-black text-sm font-medium text-white hover:bg-[#1d1d1f]"
        >
          <AppleMark />
          Sign in with Apple
        </button>
      </ProviderForm>

      <div className="flex items-center py-1">
        <div className="grow border-t border-[#e4e4e7]"></div>
        <span className="mx-4 shrink text-sm text-[#a1a1aa]">or</span>
        <div className="grow border-t border-[#e4e4e7]"></div>
      </div>

      <ProviderForm provider="github">
        <button
          type="submit"
          className="w-full text-sm text-[#71717a] transition-colors hover:text-[#18181b]"
        >
          Continue with GitHub
        </button>
      </ProviderForm>
    </div>
  );
}

export default SignInButtons;
