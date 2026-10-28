/** Resolve CSS colors when building chart options, and again after a theme change. */
export function getChartTheme() {
  const styles = getComputedStyle(document.documentElement)
  const color = (name: string) => styles.getPropertyValue(`--color-${name}`).trim()
  return {
    forecast: color('forecast'),
    actual: color('actual'),
    error: color('danger'),
    warning: color('warning'),
    text: color('text'),
    border: color('border'),
    background: color('background'),
    surface: color('surface'),
    heading: color('heading'),
    primarySubtle: color('primary-subtle'),
  }
}
