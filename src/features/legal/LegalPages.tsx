import type { ReactNode } from 'react'
import { usePageMeta } from '@/hooks/usePageMeta'

/**
 * Legal + safety pages (Phase 8). These are launch templates written
 * for NeighborMart's actual behavior (no payments processed, Firebase +
 * Cloudinary as processors). Have them reviewed by a lawyer before
 * relying on them commercially — see docs/LAUNCH_CHECKLIST.md.
 */

function LegalShell({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  usePageMeta({ title, description: `${title} for NeighborMart — your local marketplace.` })
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold text-bark sm:text-4xl">{title}</h1>
        <p className="mt-1 text-sm text-bark-light">Last updated: {updated}</p>
      </header>
      <div className="flex flex-col gap-5 rounded-[2rem] border border-bark/10 bg-surface p-6 text-sm leading-relaxed text-bark-light shadow-sm sm:p-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-bark [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed [&_section]:flex [&_section]:flex-col [&_section]:gap-2">
        {children}
      </div>
    </article>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="8 November 2026">
      <section>
        <h2>1. What NeighborMart is</h2>
        <p>
          NeighborMart is a local marketplace that connects neighbors who want to borrow, rent, buy,
          or sell items, vehicles, properties, and sports arena time. NeighborMart provides the
          platform only — it is not a party to any deal between users.
        </p>
      </section>
      <section>
        <h2>2. No payment processing</h2>
        <p>
          NeighborMart does not process, hold, or guarantee payments in this release. Any money —
          rent, sale price, or refundable deposit — is exchanged directly between users, who are
          responsible for agreeing the amount, inspecting the item, and keeping their own records.
        </p>
      </section>
      <section>
        <h2>3. Your account</h2>
        <p>
          You must provide accurate information, keep your login secure, and be old enough to form a
          binding contract in your country. You are responsible for activity under your account. We
          may suspend or remove accounts that break these terms.
        </p>
      </section>
      <section>
        <h2>4. Listings and deals</h2>
        <ul>
          <li>List only items you own or are authorized to lend, rent, or sell.</li>
          <li>Descriptions and photos must be honest and your own.</li>
          <li>
            Prohibited: illegal goods, weapons, stolen property, and anything unlawful to trade.
          </li>
          <li>
            Borrowed and rented items must be returned on time and in the condition received; damage
            or loss is a matter between the users involved.
          </li>
          <li>Arena bookings are requests until the owner approves them.</li>
        </ul>
      </section>
      <section>
        <h2>5. Trust scores and reviews</h2>
        <p>
          Trust scores are computed from deals, reviews, verification, and responsiveness. They are
          an aid, not a guarantee. Reviews must be truthful and based on a real interaction.
        </p>
      </section>
      <section>
        <h2>6. Safety</h2>
        <p>
          Meet in public places where practical, inspect items before paying, and never share
          financial credentials. See our safety guidance for practical anti-scam advice. Report
          suspicious listings or users in the app — moderators may remove content and accounts.
        </p>
      </section>
      <section>
        <h2>7. Liability</h2>
        <p>
          The service is provided “as is”. To the extent permitted by law, NeighborMart is not
          liable for losses arising from deals between users, item condition, or service
          interruptions.
        </p>
      </section>
      <section>
        <h2>8. Changes</h2>
        <p>
          We may update these terms; continued use after an update means you accept the new terms.
          Material changes will be announced in the app.
        </p>
      </section>
    </LegalShell>
  )
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="8 November 2026">
      <section>
        <h2>1. What we collect</h2>
        <ul>
          <li>
            Account data: name, email address, and (if you add them) phone number, photo, city and
            neighborhood.
          </li>
          <li>Listings you publish, including photos and approximate location (city/area).</li>
          <li>Requests, bookings, reviews, and messages you send through the app.</li>
          <li>Basic technical data needed to run the service (device/browser, error logs).</li>
        </ul>
      </section>
      <section>
        <h2>2. How we use it</h2>
        <p>
          To operate the marketplace: showing your listings and profile to other users, connecting
          requesters and owners, computing trust scores, preventing abuse, and improving the
          service. We do not sell your personal data.
        </p>
      </section>
      <section>
        <h2>3. Who processes it</h2>
        <p>
          We use Google Firebase (authentication, database, hosting) and Cloudinary (listing photo
          storage and delivery) as processors. Signing in with Google shares your name, email, and
          profile photo from your Google account. Their respective privacy policies apply to their
          processing.
        </p>
      </section>
      <section>
        <h2>4. What other users see</h2>
        <p>
          Your public profile (name, photo, neighborhood, trust score, reviews) and your listings
          are visible to other users. Your phone number is shown only if you enable “show phone” —
          it is off by default.
        </p>
      </section>
      <section>
        <h2>5. Your choices and deletion</h2>
        <p>
          You can edit your profile at any time, block other users, and delete your account from
          your profile page. Deleting your account removes your profile and listings; messages and
          reviews you exchanged may remain visible to the other party in anonymized form where
          needed for their records. You may also contact us to request deletion.
        </p>
      </section>
      <section>
        <h2>6. Retention and security</h2>
        <p>
          Data is kept while your account is active and deleted or anonymized after account
          deletion, except where the law requires retention. Access is protected by Firebase
          security rules and account authentication.
        </p>
      </section>
      <section>
        <h2>7. Children</h2>
        <p>
          NeighborMart is not intended for children under 13 (or the minimum age in your country).
        </p>
      </section>
      <section>
        <h2>8. Contact</h2>
        <p>Questions about this policy: contact the NeighborMart operator via the app.</p>
      </section>
    </LegalShell>
  )
}

const SAFETY_TIPS = [
  {
    title: 'Meet in a public, busy place',
    text: 'For first deals, meet at a market, mall entrance, or your street in daylight. Bring a friend for high-value items like vehicles or electronics.',
  },
  {
    title: 'Inspect before you pay',
    text: 'Check the item works, the vehicle documents match, and the property is as described — before any money changes hands. Walk away if it feels off.',
  },
  {
    title: 'Never pay in advance to a stranger',
    text: 'The classic scam: a “too good” price plus a request for advance payment via mobile wallet. On NeighborMart, deals settle in person at handover — there is no advance-payment step.',
  },
  {
    title: 'Keep chat inside the app',
    text: 'Scammers push you to other channels so there is no record. Keeping requests and chat in NeighborMart protects you and builds your trust score.',
  },
  {
    title: 'Check the trust score — and build yours',
    text: 'Prefer neighbors with completed deals and reviews. New accounts are fine too: start small, meet publicly, and let the score grow.',
  },
  {
    title: 'Guard your codes and passwords',
    text: 'NeighborMart will never ask for your password, a verification code, or card details. Anyone asking is not us — report them.',
  },
  {
    title: 'Agree the deposit in writing',
    text: 'For borrows and rentals, confirm the deposit, return date, and condition in the app chat before pickup, with a quick photo of the item’s condition.',
  },
  {
    title: 'Report anything suspicious',
    text: 'Every listing and profile has a Report option. Reports go to moderators, who can remove listings and accounts. You can also block any user.',
  },
] as const

export function SafetyPage() {
  usePageMeta({
    title: 'Stay safe & avoid scams',
    description:
      'Practical anti-scam guidance for borrowing, renting, buying and selling on NeighborMart.',
  })
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold text-bark sm:text-4xl">
          Stay safe &amp; avoid scams
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bark-light sm:text-base">
          NeighborMart deals happen between real neighbors, in person. A few habits make them safe
          almost every time.
        </p>
      </header>
      <ol className="flex list-none flex-col gap-4">
        {SAFETY_TIPS.map((tip, i) => (
          <li
            key={tip.title}
            className="flex gap-4 rounded-3xl border border-bark/10 bg-surface p-5 shadow-sm"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-moss-50 font-display text-base font-extrabold text-moss-700 dark:text-moss-300 dark:bg-moss-900 dark:text-moss-200"
            >
              {i + 1}
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-bark">{tip.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-bark-light">{tip.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  )
}
