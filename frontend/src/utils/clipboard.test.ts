import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { copyText, resolvePaste } from './clipboard.ts'

const image = new File(['png'], 'image.png', { type: 'image/png' })
const sheetImage = new File(['png'], 'image.png', { type: 'image/png' })

test('spreadsheet cells paste as text even when a PNG rendering comes along', () => {
  const plainText = 'Nome\tQtd\nBorracha\t10\nCaneta\t4'
  assert.deepEqual(resolvePaste({ plainText, files: [sheetImage] }), { type: 'text', text: plainText })
})

test('plain text pastes as text with no files present', () => {
  assert.deepEqual(resolvePaste({ plainText: 'olá mundo', files: [] }), { type: 'text', text: 'olá mundo' })
})

test('whitespace-only plain text is still treated as text', () => {
  assert.deepEqual(resolvePaste({ plainText: '   ', files: [] }), { type: 'text', text: '   ' })
})

test('image without text pastes as a file attachment', () => {
  assert.deepEqual(resolvePaste({ plainText: '', files: [image] }), { type: 'files', files: [image] })
})

test('file copy whose plain text is only the file name keeps the file', () => {
  const doc = new File(['pdf'], 'relatorio.pdf', { type: 'application/pdf' })
  assert.deepEqual(resolvePaste({ plainText: 'relatorio.pdf', files: [doc] }), { type: 'files', files: [doc] })
  assert.deepEqual(resolvePaste({ plainText: ' relatorio.pdf \n', files: [doc] }), {
    type: 'text',
    text: ' relatorio.pdf \n',
  })
})

test('a single-line text that matches no file name pastes as text', () => {
  assert.deepEqual(resolvePaste({ plainText: 'ver anexo', files: [image] }), { type: 'text', text: 'ver anexo' })
})

test('empty clipboard does nothing', () => {
  assert.deepEqual(resolvePaste({ plainText: '', files: [] }), { type: 'none' })
})

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  // navigator é somente-leitura no globalThis do Node, então precisa de defineProperty.
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: writeText ? { writeText } : undefined },
    configurable: true,
    writable: true,
  })
}

function stubLegacyDom(copied: { value: string | null; result: boolean }) {
  const appended: string[] = []
  ;(globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({
      value: '',
      style: {} as Record<string, string>,
      setAttribute: () => {},
      select: () => {},
      setSelectionRange: () => {},
      remove: () => {},
    }),
    body: {
      appendChild: (node: { value: string }) => {
        appended.push(node.value)
        copied.value = node.value
      },
    },
    execCommand: () => copied.result,
  }
  return appended
}

test('copy uses the async clipboard API when available', async () => {
  const written: string[] = []
  stubClipboard(async (text) => {
    written.push(text)
  })
  assert.equal(await copyText('Mensagem copiada'), true)
  assert.deepEqual(written, ['Mensagem copiada'])
})

test('copy falls back to the legacy path when the clipboard API is missing', async () => {
  stubClipboard(undefined)
  const copied = { value: null as string | null, result: true }
  stubLegacyDom(copied)
  assert.equal(await copyText('Sem HTTPS'), true)
  assert.equal(copied.value, 'Sem HTTPS')
})

test('copy falls back to the legacy path when the clipboard API rejects', async () => {
  stubClipboard(async () => {
    throw new Error('permissão negada')
  })
  const copied = { value: null as string | null, result: true }
  stubLegacyDom(copied)
  assert.equal(await copyText('Permissão negada'), true)
  assert.equal(copied.value, 'Permissão negada')
})

test('copy reports failure when neither path works', async () => {
  stubClipboard(undefined)
  const copied = { value: null as string | null, result: false }
  stubLegacyDom(copied)
  assert.equal(await copyText('Falha'), false)
})
