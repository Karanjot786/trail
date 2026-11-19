// ISO-2 country code → flag emoji (regional indicator pair) and display name.
export function flag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '🏳️'
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
export function countryName(code: string): string {
  if (!code) return 'Unknown'
  try {
    return names?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}
