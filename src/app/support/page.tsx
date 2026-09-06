import type { Metadata } from 'next'
import LegalPage, { Section } from '@/components/LegalPage'
import { SUPPORT_EMAIL } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Support — Roughly',
  description: 'How to get help with Roughly, and answers to the usual questions.',
}

export default function SupportPage() {
  return (
    <LegalPage title="Support" updated="4 September 2026">
      <p>
        Something not working, or a question the app does not answer? Email{' '}
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        . Include your iOS version and roughly when the problem happened — it makes a fix far
        faster.
      </p>

      <Section heading="How do I delete my account?">
        <p>
          <strong>Settings → Delete account</strong>, in the app. It erases everything immediately
          and cannot be undone. The same option is on the web under Settings.
        </p>
      </Section>

      <Section heading="The calorie numbers look wrong">
        <p>
          They are estimates from a photograph, and they will sometimes be off — that is what the
          name is admitting. Tell the coach in chat what it got wrong and it will adjust the entry.
          If the estimates are consistently far out for a food you eat often, that is worth an
          email.
        </p>
      </Section>

      <Section heading="I&apos;m not getting notifications">
        <p>
          Check <strong>Settings</strong> in the app first — if it offers to turn notifications on,
          they were never enabled. If iOS refused them earlier, the app can only send you to{' '}
          <em>iOS Settings → Roughly → Notifications</em>, because iOS shows its permission prompt
          only once.
        </p>
      </Section>

      <Section heading="The coach stopped replying today">
        <p>
          There is a daily cap on coach messages and photo analyses, because each one costs real
          money to run. It resets at midnight in your timezone. The coach will tell you when you hit
          it.
        </p>
      </Section>

      <Section heading="Can I use it on iPad?">
        <p>
          Not yet. Roughly is built for iPhone, and shipping an iPad layout that had never been
          properly designed would be worse than not offering one.
        </p>
      </Section>

      <Section heading="Privacy">
        <p>
          What is collected and who processes it is set out in the{' '}
          <a className="underline" href="/privacy">
            privacy policy
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
