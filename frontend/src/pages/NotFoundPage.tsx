import { Link } from 'react-router'
import { useT } from '../i18n'

function NotFoundPage() {
  const t = useT()
  return (
    <>
      <h1>{t.notFound.title}</h1>
      <p>
        <Link to="/">{t.common.backToHouseholds}</Link>
      </p>
    </>
  )
}

export default NotFoundPage
