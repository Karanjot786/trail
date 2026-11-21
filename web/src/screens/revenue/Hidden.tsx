// Revenue is hidden (Task F4-5): the site has never sent a Purchase event, or a share link hides revenue.
import { RouteLink } from '../../shell/RouteLink'
import { CodeBlock } from '../../ui/code'
import { EmptyState } from '../../ui/states'

export const PURCHASE_SNIPPET = "trail.track('Purchase', { amount: 19, currency: 'USD' })"

export function Hidden({ domain, shareHidden }: { domain: string; shareHidden: boolean }) {
  if (shareHidden) return <EmptyState title="Revenue is hidden on this link" body="The person who shared this link chose to leave revenue out." />
  return (
    <div className="panel">
      <EmptyState
        numeral="0"
        title={`Revenue is hidden for ${domain}`}
        body={
          <>
            Trail shows Revenue only for websites that have sent at least one <code className="inl">Purchase</code> event, so nobody sees an empty money screen they cannot use.{' '}
            {domain} has not sent one yet. Send it from your checkout, with the amount in major units, and the screen, the sidebar item and the Overview number appear by
            themselves. Revenue is reported by your site, and credited by first touch.
          </>
        }
      />
      <div className="px-6 pb-6" style={{ maxWidth: 680 }}>
        <CodeBlock code={PURCHASE_SNIPPET} lang="js" filename="checkout.js" />
        <p className="method" style={{ marginTop: 10 }}>
          <RouteLink patch={{ screen: 'settings', tab: 'install', id: null, sheet: null }}>Install and events docs</RouteLink>
        </p>
      </div>
    </div>
  )
}
