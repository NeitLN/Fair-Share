import { useT } from '../i18n'
import { useSlowRequests } from '../lib/slowRequests'

/**
 * "Phản hồi đang lâu hơn bình thường…" above every page while a request has waited more than 5 s
 * (specs/011-first-impressions, US2). It goes by itself; it is in the page flow, so it covers nothing.
 * Screen readers hear it once per episode: the text sits in the live region only for a showing that
 * starts one, so moving between pages or a quick second showing is not read out again.
 */
function SlowNotice() {
  const t = useT()
  const { slow, announce } = useSlowRequests()
  return (
    <div className="slow-wrap">
      {/* A polite live region; not role="status", which the toasts use */}
      <div aria-live="polite">{slow && announce && <p className="slow-notice">{t.app.slowNotice}</p>}</div>
      {slow && !announce && <p className="slow-notice">{t.app.slowNotice}</p>}
    </div>
  )
}

export default SlowNotice
