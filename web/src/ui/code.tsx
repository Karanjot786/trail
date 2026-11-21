// CopyButton and CodeBlock (plan §0.10). The copy icon cross-fades to a check and back.
import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const t = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(t.current), [])
  return (
    <button
      type="button"
      className="icon-btn copy"
      aria-label={done ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).catch(() => undefined)
        setDone(true)
        window.clearTimeout(t.current)
        t.current = window.setTimeout(() => setDone(false), 1600)
      }}
    >
      <span className="sw" data-out={done ? '' : undefined}>
        <Copy size={14} aria-hidden="true" />
      </span>
      <span className="sw" data-out={done ? undefined : ''}>
        <Check size={14} aria-hidden="true" />
      </span>
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
    <figure className="codeblock">
      {filename && <figcaption className="mono">{filename}</figcaption>}
      <pre className="code" data-lang={lang} tabIndex={0} aria-label={filename ? `${filename} code` : 'Code'}>
        <code>{code}</code>
        <span className="copy-slot">
          <CopyButton text={code} label={filename ? `Copy ${filename}` : 'Copy code'} />
        </span>
      </pre>
    </figure>
  )
}
