import { disconnectTelegram } from '@/app/actions/disconnectTelegram'

export function ConnectTelegram({ linked, linkUrl }: { linked: boolean; linkUrl: string | null }) {
  return (
    <section className="mt-6 rounded-[14px] border border-[#e4e4e7] bg-white p-5">
      <h2 className="font-[600]">Telegram</h2>
      <p className="mt-1 text-sm text-[#71717a]">
        Connect Telegram to chat with your coach and send meal photos straight from your phone.
      </p>

      {linked ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm font-medium text-[#059669]">Connected ✓</p>
          <form action={disconnectTelegram}>
            <button
              type="submit"
              className="rounded-md border border-[#e4e4e7] px-3 py-1.5 text-sm text-[#71717a] hover:text-[#18181b]"
            >
              Disconnect
            </button>
          </form>
        </div>
      ) : linkUrl ? (
        <div className="mt-4">
          <a
            href={linkUrl}
            className="inline-block rounded-full bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Connect Telegram
          </a>
          <p className="mt-2 text-xs text-[#a1a1aa]">
            Opens your Telegram app. The link expires in 15 minutes — reload this page for a fresh one.
          </p>
        </div>
      ) : null}
    </section>
  )
}

export default ConnectTelegram
