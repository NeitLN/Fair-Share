import { useEffect } from 'react'

/**
 * The browser tab names the page ("Nhà của bạn · Fair-Share"), so a screen reader user hears where
 * an in-app link led and a person with many tabs finds this one (specs/017, FR-024). Leaving the page
 * puts back the app's own title, in the current language (`appTitle`). App sets that title in a layout
 * effect, which runs before this one, so the page's title wins while the page is shown.
 */
export function usePageTitle(text: string, appTitle: string) {
  useEffect(() => {
    document.title = `${text} · Fair-Share`
    return () => {
      document.title = appTitle
    }
  }, [text, appTitle])
}
