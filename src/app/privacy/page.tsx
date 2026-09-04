import type { Metadata } from 'next'
import LegalPage, { Section } from '@/components/LegalPage'
import { SUPPORT_EMAIL } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Privacy Policy — Roughly',
  description: 'What Roughly collects, why, who it goes to, and how to delete it.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="4 September 2026">
      <p>
        Roughly is a personal diet and training coach. It only works if it knows what you ate and
        how you trained, so it stores that. This page says exactly what it keeps, who else sees it,
        and how to get rid of all of it.
      </p>

      <Section heading="What is collected">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Your identity.</strong> Signing in with Apple gives Roughly your email address
            and, if you choose to share it, your name. Roughly never sees your Apple password. If
            you use Apple&apos;s Hide My Email, only the relay address is stored.
          </li>
          <li>
            <strong>Meal photos and their analysis.</strong> Photos you take, plus the food items,
            calories and protein estimated from them.
          </li>
          <li>
            <strong>Health and fitness entries.</strong> Weight, waist measurement, training
            sessions, steps, sleep and recovery values, and mood scores — whatever you log.
          </li>
          <li>
            <strong>Your conversations with the coach,</strong> including weekly check-in answers.
          </li>
          <li>
            <strong>A push notification token,</strong> if you turn notifications on, so the coach
            can remind you about a check-in.
          </li>
          <li>
            <strong>An App Attest key identifier,</strong> which Apple issues to prove the requests
            come from a real, unmodified copy of the app. It identifies the app instance, not you.
          </li>
        </ul>
        <p>
          There is no analytics SDK, no advertising identifier, no tracking across other apps or
          websites, and nothing is sold or shared with data brokers.
        </p>
      </Section>

      <Section heading="Who else sees it">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Anthropic</strong> processes meal photos and coach messages to produce the
            estimates and replies. Anthropic does not train its models on API data.
          </li>
          <li>
            <strong>Vercel</strong> hosts the service and stores meal photos.
          </li>
          <li>
            <strong>Apple</strong> delivers push notifications and verifies App Attest.
          </li>
          <li>
            <strong>Telegram,</strong> only if you deliberately link a Telegram account on the web,
            and only for the messages exchanged there.
          </li>
        </ul>
        <p>Each of these is a processor doing a job for Roughly. None of them get your data to use for their own purposes.</p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Your data stays until you delete it. Roughly does not expire old entries, because the
          point of a coach is remembering what happened months ago.
        </p>
      </Section>

      <Section heading="Deleting everything">
        <p>
          In the iOS app: <strong>Settings → Delete account</strong>. On the web:{' '}
          <strong>Settings → Delete account</strong>. Either one permanently erases your account and
          every entry attached to it — meals, photos, chat history, check-ins, measurements,
          training, targets and your notification tokens. It is immediate and cannot be undone.
        </p>
        <p>
          You can also revoke Roughly&apos;s access at any time in{' '}
          <em>iOS Settings → your name → Sign in with Apple</em>, though that alone does not delete
          what is already stored — use the in-app delete for that.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Traffic is HTTPS only. Your session token is held in the iOS Keychain, never in plain
          storage, and never synced to iCloud. Requests from the app are signed with an
          Apple-issued App Attest key so a stolen token cannot be replayed from somewhere else.
        </p>
      </Section>

      <Section heading="Children">
        <p>Roughly is not directed at children under 13 and should not be used by them.</p>
      </Section>

      <Section heading="This is not medical advice">
        <p>
          Roughly estimates. It is a coach, not a clinician, and its calorie and protein figures are
          approximations from a photo — the name is the honest part. Nothing it says is medical
          advice, diagnosis or treatment. Talk to a doctor or a registered dietitian before changing
          how you eat or train, especially if you have a health condition or a history of disordered
          eating.
        </p>
      </Section>

      <Section heading="Changes and contact">
        <p>
          If this policy changes materially, the date at the top changes with it. Questions, or a
          deletion you cannot complete in the app:{' '}
          <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
