import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { resolvePaste } from './clipboard.ts'

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
