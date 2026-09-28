import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { CodeBlock } from '../CodeBlock'

type InlineMatch = {
  start: number
  end: number
  kind: 'block' | 'code' | 'strike' | 'bold' | 'italic'
  inner: string
  lang?: string
}

function renderInline(text: string, out: ReactNode[], key: number): void {
  const candidates: InlineMatch[] = []
  const block = text.match(/```([a-zA-Z0-9_#-]+)?(?:\r?\n|[ \t]+)([\s\S]*?)```/) ?? text.match(/```([\s\S]*?)```/)
  const code = text.match(/`([^`]+)`/)
  const strike = text.match(/~~([^~]+)~~/)
  const bold = text.match(/\*\*([^*]+)\*\*/) ?? text.match(/\*([^*]+)\*/)
  const italic = text.match(/_([^_]+)_/)
  if (block) {
    const rawLang = block[2] !== undefined ? block[1] : undefined
    const innerContent = block[2] !== undefined ? block[2] : (block[1] ?? '')
    candidates.push({
      start: block.index!,
      end: block.index! + block[0].length,
      kind: 'block',
      inner: innerContent.replace(/^\r?\n/, '').replace(/\r?\n$/, ''),
      lang: rawLang,
    })
  }
  if (code) candidates.push({ start: code.index!, end: code.index! + code[0].length, kind: 'code', inner: code[1] })
  if (strike) candidates.push({ start: strike.index!, end: strike.index! + strike[0].length, kind: 'strike', inner: strike[1] })
  if (bold) candidates.push({ start: bold.index!, end: bold.index! + bold[0].length, kind: 'bold', inner: bold[1] })
  if (italic) candidates.push({ start: italic.index!, end: italic.index! + italic[0].length, kind: 'italic', inner: italic[1] })

  if (candidates.length === 0) {
    out.push(text)
    return
  }
  candidates.sort((a, b) => a.start - b.start)
  const m = candidates[0]
  if (m.start > 0) out.push(text.slice(0, m.start))
  if (m.kind === 'block') {
    out.push(<CodeBlock key={key} code={m.inner} language={m.lang} />)
  } else if (m.kind === 'code') {
    out.push(<code key={key}>{m.inner}</code>)
  } else {
    const inner: ReactNode[] = []
    renderInline(m.inner, inner, key + 1)
    if (m.kind === 'strike') out.push(<del key={key}>{inner}</del>)
    else if (m.kind === 'bold') out.push(<strong key={key}>{inner}</strong>)
    else out.push(<em key={key}>{inner}</em>)
  }
  renderInline(text.slice(m.end), out, key + 100)
}

export function renderMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = []
  renderInline(text, out, 0)
  return out
}

export function renderMessageContent(text: string, currentUsername: string): ReactNode[] {
  return text.split(/(```[\s\S]*?```)/g).flatMap((part, blockIndex) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      return [<Fragment key={`block-${blockIndex}`}>{renderMarkdown(part)}</Fragment>]
    }
    return part.split(/(@[a-zA-Z0-9._-]+|https:\/\/[^\s<]+)/g).map((piece, pieceIndex) =>
      /^https:\/\/[^\s<]+$/.test(piece)
        ? <a key={`${blockIndex}-${pieceIndex}`} className="message-link" href={piece} target="_blank" rel="noopener noreferrer">{piece}</a>
        : /^@[a-zA-Z0-9._-]+$/.test(piece)
        ? <span
            className={`message-mention ${piece.slice(1).toLowerCase() === currentUsername.toLowerCase() ? 'message-mention-self' : ''}`}
            key={`${blockIndex}-${pieceIndex}`}
          >
            {piece}
          </span>
        : <Fragment key={`${blockIndex}-${pieceIndex}`}>{renderMarkdown(piece)}</Fragment>,
    )
  })
}
