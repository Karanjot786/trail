// One polite live region for shell announcements ("Filter added. Press Back to undo.").
export function announce(msg: string): void {
  const r = document.getElementById('live-region')
  if (!r) return
  r.textContent = ''
  window.setTimeout(() => {
    r.textContent = msg
  }, 30)
}
