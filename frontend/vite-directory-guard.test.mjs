import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import { directoryGuard } from './vite-directory-guard.mjs'

test('rejects filesystem directories without breaking Vite file requests', async () => {
  const server = await createServer({
    configFile: false,
    plugins: [directoryGuard()],
    optimizeDeps: { noDiscovery: true },
    server: { port: 0, host: '127.0.0.1' },
  })
  try {
    await server.listen()
    const address = server.httpServer.address()
    const origin = `http://127.0.0.1:${address.port}`
    const directory = await fetch(`${origin}/@fs${process.cwd()}?import`)
    assert.equal(directory.status, 404)
    const file = await fetch(`${origin}/@fs${process.cwd()}/vite-directory-guard.mjs?import`)
    assert.equal(file.status, 200)
  } finally {
    await server.close()
  }
})
