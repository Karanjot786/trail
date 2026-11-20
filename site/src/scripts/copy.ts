// One delegated listener for every copy button: [data-copy] holds the text, [data-copy-from] names an element id.
document.addEventListener('click', async (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-copy],[data-copy-from]')
  if (!b) return
  const text = b.dataset.copy ?? document.getElementById(b.dataset.copyFrom!)?.textContent ?? ''
  const label = b.dataset.label ?? b.getAttribute('aria-label') ?? 'Copy'
  b.dataset.label = label
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* clipboard blocked: the code stays selectable */
  }
  b.classList.add('done')
  b.setAttribute('aria-label', 'Copied')
  clearTimeout(Number(b.dataset.t))
  b.dataset.t = String(
    setTimeout(() => {
      b.classList.remove('done')
      b.setAttribute('aria-label', label)
    }, 1600),
  )
})
