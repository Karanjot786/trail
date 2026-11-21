// STUB (P0). F1 owns this file (plan §0.10): keep the props, replace the body.
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button type="button" onClick={() => void navigator.clipboard?.writeText(text)}>
      {label}
    </button>
  )
}

export interface CodeBlockProps {
  code: string
  lang?: string
  filename?: string
}
export function CodeBlock({ code, lang, filename }: CodeBlockProps) {
  return (
    <figure>
      {filename && <figcaption>{filename}</figcaption>}
      <pre data-lang={lang} tabIndex={0}>
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </figure>
  )
}
