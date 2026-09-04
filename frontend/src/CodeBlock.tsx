import { useState, useMemo } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-markup-templating'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-docker'

export type CodeBlockProps = {
  code: string
  language?: string
}

export function formatHtml(html: string): string {
  let formatted = ''
  let indentLevel = 0
  const indentStr = '  '
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ])

  const tokens = html.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).filter((t) => t.trim().length > 0)

  for (const token of tokens) {
    if (token.startsWith('</')) {
      indentLevel = Math.max(0, indentLevel - 1)
      formatted += `${indentStr.repeat(indentLevel)}${token}\n`
    } else if (token.startsWith('<') && !token.startsWith('<!') && !token.startsWith('<?')) {
      const isSelfClosing = token.endsWith('/>')
      const tagMatch = token.match(/^<([a-zA-Z0-9:-]+)/)
      const tagName = tagMatch ? tagMatch[1].toLowerCase() : ''
      const isVoid = voidTags.has(tagName) || isSelfClosing

      formatted += `${indentStr.repeat(indentLevel)}${token}\n`
      if (!isVoid) {
        indentLevel++
      }
    } else if (token.startsWith('<!') || token.startsWith('<?')) {
      formatted += `${indentStr.repeat(indentLevel)}${token}\n`
    } else {
      const lines = token.trim().split(/\r?\n/)
      for (const line of lines) {
        if (line.trim()) {
          formatted += `${indentStr.repeat(indentLevel)}${line.trim()}\n`
        }
      }
    }
  }

  return formatted.trimEnd() || html
}

export function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function detectLanguage(code: string, specifiedLang?: string): { lang: string; display: string } {
  const norm = (specifiedLang || '').trim().toLowerCase()
  const langMap: Record<string, { lang: string; display: string }> = {
    html: { lang: 'markup', display: 'HTML' },
    xml: { lang: 'markup', display: 'XML' },
    svg: { lang: 'markup', display: 'SVG' },
    markup: { lang: 'markup', display: 'HTML' },
    js: { lang: 'javascript', display: 'JavaScript' },
    javascript: { lang: 'javascript', display: 'JavaScript' },
    ts: { lang: 'typescript', display: 'TypeScript' },
    typescript: { lang: 'typescript', display: 'TypeScript' },
    css: { lang: 'css', display: 'CSS' },
    json: { lang: 'json', display: 'JSON' },
    sql: { lang: 'sql', display: 'SQL' },
    java: { lang: 'java', display: 'Java' },
    py: { lang: 'python', display: 'Python' },
    python: { lang: 'python', display: 'Python' },
    php: { lang: 'php', display: 'PHP' },
    c: { lang: 'c', display: 'C' },
    cpp: { lang: 'cpp', display: 'C++' },
    'c++': { lang: 'cpp', display: 'C++' },
    cs: { lang: 'csharp', display: 'C#' },
    csharp: { lang: 'csharp', display: 'C#' },
    'c#': { lang: 'csharp', display: 'C#' },
    go: { lang: 'go', display: 'Go' },
    golang: { lang: 'go', display: 'Go' },
    rs: { lang: 'rust', display: 'Rust' },
    rust: { lang: 'rust', display: 'Rust' },
    sh: { lang: 'bash', display: 'Bash' },
    bash: { lang: 'bash', display: 'Bash' },
    shell: { lang: 'bash', display: 'Bash' },
    zsh: { lang: 'bash', display: 'Bash' },
    yml: { lang: 'yaml', display: 'YAML' },
    yaml: { lang: 'yaml', display: 'YAML' },
    docker: { lang: 'docker', display: 'Dockerfile' },
    dockerfile: { lang: 'docker', display: 'Dockerfile' },
    md: { lang: 'markdown', display: 'Markdown' },
    markdown: { lang: 'markdown', display: 'Markdown' },
  }

  if (norm && langMap[norm]) {
    return langMap[norm]
  }

  const trimmed = code.trim()

  // 1. JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return { lang: 'json', display: 'JSON' }
    } catch {
      // Not valid JSON, continue checks
    }
  }

  // 2. HTML / XML / SVG
  if (
    /^\s*<!DOCTYPE\s+html/i.test(trimmed) ||
    /^\s*<html\b/i.test(trimmed) ||
    /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/i.test(trimmed)
  ) {
    return { lang: 'markup', display: 'HTML' }
  }

  // 3. PHP
  if (/<\?php|\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*\s*=|echo\s+['"\$]/.test(trimmed)) {
    return { lang: 'php', display: 'PHP' }
  }

  // 4. Python
  if (
    /(^\s*(def\s+\w+\s*\(|class\s+\w+(\s*\([^)]*\))?\s*:|from\s+[\w.]+\s+import|import\s+[\w.]+|@\w+(\(.*\))?\s*\ndef|if\s+__name__\s*==\s*['"]__main__['"]|elif\s+.*:|print\s*\(|self\.\w+)|#.*python)/m.test(trimmed)
  ) {
    return { lang: 'python', display: 'Python' }
  }

  // 5. Bash / Shell
  if (
    /^\s*(#!\/bin\/(bash|sh|zsh)|sudo\s+|curl\s+-|apt-get\s+|docker\s+(run|build|compose|ps)|npm\s+(run|install|i|test)|git\s+(commit|checkout|clone|push|pull|status)|chmod\s+[0-9+x])/m.test(trimmed)
  ) {
    return { lang: 'bash', display: 'Bash' }
  }

  // 6. SQL
  if (/^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(trimmed)) {
    return { lang: 'sql', display: 'SQL' }
  }

  // 7. Go
  if (/\b(func\s+(\([^)]+\)\s+)?\w+\s*\(|package\s+\w+|import\s+(\([^)]+\)|"fmt"))/.test(trimmed)) {
    return { lang: 'go', display: 'Go' }
  }

  // 8. Rust
  if (/\b(fn\s+main\s*\(|fn\s+\w+\s*\(|let\s+mut\s+|pub\s+fn\s+|impl\s+\w+)/.test(trimmed)) {
    return { lang: 'rust', display: 'Rust' }
  }

  // 9. C / C++
  if (/(#include\s+<[\w.]+>|std::(cout|cin|vector|string)|printf\s*\(|cout\s*<<)/.test(trimmed)) {
    return { lang: 'cpp', display: 'C++' }
  }

  // 10. C#
  if (/\b(using\s+System(\.[\w.]+)?;|namespace\s+[\w.]+|Console\.(WriteLine|Write)\()/.test(trimmed)) {
    return { lang: 'csharp', display: 'C#' }
  }

  // 11. Java
  if (/\b(public\s+class\s+\w+|public\s+static\s+void\s+main|System\.out\.(println|print)|@Override)\b/.test(trimmed)) {
    return { lang: 'java', display: 'Java' }
  }

  // 12. Dockerfile
  if (/^\s*(FROM\s+[a-zA-Z0-9_.-]+|RUN\s+|EXPOSE\s+\d+|WORKDIR\s+|COPY\s+)/m.test(trimmed)) {
    return { lang: 'docker', display: 'Dockerfile' }
  }

  // 13. CSS
  if (/^\s*([.#a-zA-Z0-9_\-\s,:]+)\s*\{[\s\S]*:[^;]+;[\s\S]*\}/.test(trimmed)) {
    return { lang: 'css', display: 'CSS' }
  }

  // 14. JavaScript / TypeScript
  if (
    /\b(import\s+.*from|export\s+(default|const|let|function|class)|const\s+[a-zA-Z0-9_$]+\s*=|let\s+[a-zA-Z0-9_$]+\s*=|function\s+[a-zA-Z0-9_$]+\s*\(|console\.(log|error|warn)\()/i.test(trimmed)
  ) {
    return { lang: 'javascript', display: 'JavaScript' }
  }

  return { lang: norm || 'plaintext', display: norm ? norm.toUpperCase() : 'CÓDIGO' }
}

function IconCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const { lang, display } = useMemo(() => detectLanguage(code, language), [code, language])

  const lines = useMemo(() => code.split('\n'), [code])
  const lineCount = lines.length

  const highlighted = useMemo(() => {
    try {
      const grammar = Prism.languages[lang]
      if (grammar) {
        return Prism.highlight(code, grammar, lang)
      }
    } catch {
      // Fallback
    }
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }, [code, lang])

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(code)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = code
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write failed
    }
  }

  return (
    <div className="kx-code-block">
      <div className="kx-code-header">
        <span className="kx-code-lang">{display}</span>
        <button
          type="button"
          className={`kx-code-copy ${copied ? 'kx-code-copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Código copiado' : 'Copiar código'}
        >
          {copied ? (
            <>
              <IconCheck />
              <span>Copiado!</span>
            </>
          ) : (
            <>
              <IconCopy />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="kx-code-body">
        {lineCount > 1 && (
          <div className="kx-code-gutter" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i + 1} className="kx-code-line-num">
                {i + 1}
              </span>
            ))}
          </div>
        )}
        <pre className="kx-code-pre">
          <code
            className={`language-${lang} kx-code-content`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
    </div>
  )
}
