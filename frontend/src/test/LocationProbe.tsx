import { useLocation } from 'react-router'

/** Where the app is now (path, query and #hash), for tests that check the address bar. */
function LocationProbe() {
  const { pathname, search, hash } = useLocation()
  return (
    <span data-testid="location" hidden>
      {pathname + search + hash}
    </span>
  )
}

export default LocationProbe
