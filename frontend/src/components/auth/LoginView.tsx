import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../../api'
import type { Session } from '../../types'

export function LoginView({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.login(username.trim(), password)
      onLogin({ token: res.token, user: res.user })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card-wrap">
        <div className="login-card">
          <div className="brand">
            <div className="brand-signature">
              <img className="brand-logo" src="/icons/Konnix white.png" alt="Konnix" />
              <div className="brand-wordmark">
                <strong>Konnix</strong>
                <span>Chat</span>
              </div>
            </div>
            <p>Comunicação interativa de trabalho</p>
          </div>
          <form onSubmit={submit} className="login-form">
            <label>
              Usuário
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seu.usuario"
                required
              />
            </label>
            <label>
              Senha
              <span className="password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? 'Ocultar' : 'Exibir'}
                </button>
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
        <p className="login-signature">
          <strong>Criado por</strong> Geraldo Valencia<br />
          <strong>Colaboração</strong>: Anderson Fabião, Kevin Kilmer,<br />
          Sérgio Cauã e Matheus Bruno
        </p>
      </div>
    </div>
  )
}
