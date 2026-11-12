import { Link } from 'react-router'
import { useT } from '../i18n'
import { usePageTitle } from '../lib/usePageTitle'

function NotFoundPage() {
  const t = useT()
  usePageTitle(t.notFound.title, t.pageTitle)
  // A page of its own, with a way back that is a real button to press (review 12/11, D09: the link was
  // 161 x 19 px)
  return (
    <section className="not-found">
      <h1>{t.notFound.title}</h1>
      <Link to="/" className="btn-primary cta">
        {t.common.backToHouseholds}
      </Link>
    </section>
  )
}

export default NotFoundPage
