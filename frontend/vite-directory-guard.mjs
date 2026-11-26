import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export function directoryGuard() {
  return {
    name: 'konnix-directory-guard',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0]
        if (!pathname.startsWith('/@fs/')) return next()

        let path
        try {
          path = fileURLToPath(`file://${pathname.slice('/@fs'.length)}`)
        } catch {
          return next()
        }

        stat(path).then((info) => {
          if (!info.isDirectory()) return next()
          res.statusCode = 404
          res.end('Not found')
        }, () => next())
      })
    },
  }
}
