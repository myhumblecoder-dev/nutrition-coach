import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SignInButtons from "@/components/SignInButtons";
import { Card } from "@/components/ui/card";

interface SignInPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/");
  }

  const { error } = await searchParams;

  const getErrorMessage = (errCode?: string) => {
    if (!errCode) return null;

    switch (errCode) {
      case "OAuthAccountNotLinked":
        return "That email is already registered through a different provider — use the one you first signed in with.";
      case "AccessDenied":
        return "Sign-in was refused for this account.";
      case "OAuthCallbackError":
      case "Configuration":
        return "Something went wrong during sign-in — please try again.";
      default:
        return "Something went wrong during sign-in — please try again.";
    }
  };

  const errorMessage = getErrorMessage(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm border-[#e4e4e7] bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">MyHumbleFitness</h1>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="space-y-4">
          <SignInButtons />
        </div>
      </Card>
    </div>
  );
}
