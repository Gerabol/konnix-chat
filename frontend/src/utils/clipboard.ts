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
