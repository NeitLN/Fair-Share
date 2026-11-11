// Apply a forced light/dark choice before the first paint, so the page never flashes (lib/theme.ts).
// A file and not an inline script, so the Content-Security-Policy can say script-src 'self' with no
// hash to keep in step (G3-05). Loaded without defer or async from <head>: it runs before the body.
try {
  var theme = localStorage.getItem('fair-share:theme')
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
    var bar = theme === 'dark' ? '#16130f' : '#f6f1e7'
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
      meta.content = bar
    })
  }
} catch {
  // Storage blocked: nothing forced, the page follows the system theme (React applies a saved choice only
  // when it is changed, never on start)
}
