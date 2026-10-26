export type ClipboardContent = {
  plainText: string
  files: File[]
}

export type PasteAction =
  | { type: 'text'; text: string }
  | { type: 'files'; files: File[] }
  | { type: 'none' }

const isFileNameOnly = (plainText: string, files: File[]) => {
  const candidate = plainText.trim()
  return candidate.length > 0 && !plainText.includes('\n') && files.some((file) => file.name === candidate)
}

/**
 * Decides how a paste must be handled in the composer.
 * Spreadsheets (Excel, Google Sheets, LibreOffice) publish a PNG rendering of the
 * copied cells next to the real content, so text always wins over the image.
 * A file copy is the exception: some file managers expose only the file name as
 * plain text, and in that case the file itself must be attached.
 */
export const resolvePaste = ({ plainText, files }: ClipboardContent): PasteAction => {
  if (plainText.length > 0) {
    if (files.length > 0 && isFileNameOnly(plainText, files)) return { type: 'files', files }
    return { type: 'text', text: plainText }
  }
  if (files.length > 0) return { type: 'files', files }
  return { type: 'none' }
}

/**
 * Caminho legado paraplo navegadores sem `navigator.clipboard`, que só existe em
 * contexto seguro. Sem ele, copiar quebra em instalações acessadas por HTTP na
 * rede interna, comum em servidores on-premise.
 */
function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* permissão negada ou contexto inseguro: tenta o caminho legado */
    }
  }
  return copyWithTextarea(text)
}

