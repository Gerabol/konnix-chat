const KX_THEMES = [
  ['default', 'Padrão', ['#f7f8fc', '#ffffff', '#5b4cf0', '#22c7d6']],
  ['dark', 'Dark clássico', ['#121212', '#23232a', '#7c5cff', '#8b72ff']],
  ['black-gray', 'Cinza e preto', ['#0f1115', '#1e232b', '#4f7cff', '#5a7fff']],
  ['pink', 'Rosa', ['#fff8fb', '#ffffff', '#e84d8a', '#f0629b']],
  ['green', 'Verde', ['#f5fbf7', '#ffffff', '#1fa463', '#27b56e']],
  ['red', 'Vermelho', ['#fff7f7', '#ffffff', '#d94141', '#e15353']],
  ['green-black', 'Verde Black', ['#0f1411', '#19221d', '#25bd70', '#33d781']],
  ['pink-black', 'Rosa Black', ['#140f13', '#241923', '#f05a9d', '#ff78b4']],
  ['red-black', 'Vermelho Black', ['#150e0e', '#251818', '#f05b5b', '#ff7777']],
  ['default-strong', 'Padrão Forte', ['#f7f8fc', '#5b4cf0', '#7669f5', '#ffffff']],
  ['green-strong', 'Verde Forte', ['#f5fbf7', '#188a53', '#35b873', '#ffffff']],
  ['pink-strong', 'Rosa Forte', ['#fff8fb', '#d93e7c', '#ee6a9d', '#ffffff']],
  ['red-strong', 'Vermelho Forte', ['#fff7f7', '#c83232', '#e85c5c', '#ffffff']],
]

function applyKonnixTheme(theme) {
  document.documentElement.dataset.theme = theme === 'default' ? '' : theme
  localStorage.setItem('konnix-doc-theme', theme)
  document.cookie = `konnix_doc_theme=${encodeURIComponent(theme)}; Max-Age=31536000; Path=/; SameSite=Lax`
  document.querySelectorAll('[data-theme-value]').forEach((item) => {
    item.classList.toggle('selected', item.dataset.themeValue === theme)
  })
}

function normalizeSidebar() {
  let nav = document.querySelector('.kx-nav')
  if (!nav) {
    const login = document.querySelector('.kx-login')
    if (!login) return
    document.body.classList.add('kx-shell-login')
    login.insertAdjacentHTML('beforebegin', '<aside class="kx-sidebar"><div class="kx-brand"><img class="kx-logo" src="../../frontend/public/icons/Konnix.png" alt="Konnix"><div class="kx-wordmark"><strong>Konnix</strong><span>System UI</span></div></div><div class="kx-sidebar-search"><span class="kx-search-icon">⌕</span><input placeholder="Pesquisar"></div><nav class="kx-nav"></nav><div class="kx-sidebar-user"><span class="kx-avatar">GV</span><span><strong>Geraldo Valencia</strong><small>Administrador</small></span></div></aside>')
    nav = document.querySelector('.kx-nav')
  }
  const page = location.pathname.split('/').pop() || 'index.html'
  nav.innerHTML = `<span class="kx-nav-label">Biblioteca</span><a class="${page === 'index.html' ? 'active' : ''}" href="index.html"><span class="kx-nav-icon">▦</span>Visão geral</a><a class="${page === 'dashboard.html' ? 'active' : ''}" href="dashboard.html"><span class="kx-nav-icon">⌂</span>Dashboard</a><a class="${page === 'componentes.html' ? 'active' : ''}" href="componentes.html"><span class="kx-nav-icon">◈</span>Componentes</a><a href="login.html"><span class="kx-nav-icon">↪</span>Autenticação</a><details class="kx-nav-section" open><summary>Seções de referência</summary><ul><li><a href="componentes.html#elementos">Elementos</a></li><li><a href="componentes.html#formularios">Formulários</a></li><li><a href="componentes.html#tabelas">Tabelas</a></li><li><a href="componentes.html#graficos">Gráficos</a></li></ul></details>`
}

function themeMarkup() {
  return `<div class="kx-theme-backdrop" data-theme-close><section class="kx-theme-modal" role="dialog" aria-modal="true" aria-labelledby="theme-title"><div class="kx-modal-head"><div><p class="kx-kicker">Personalização</p><h2 id="theme-title">Escolher tema</h2></div><button class="kx-icon-btn" data-theme-close aria-label="Fechar">×</button></div><p class="kx-modal-copy">Selecione uma combinação de cores para a aplicação.</p><div class="kx-theme-options" role="radiogroup">${KX_THEMES.map(([id, label, colors]) => `<button class="kx-theme-option" data-theme-value="${id}" role="radio" aria-label="${label}"><span class="kx-theme-option-label">${label}</span><span class="kx-theme-swatches">${colors.map((color) => `<i style="background:${color}"></i>`).join('')}</span></button>`).join('')}</div></section></div>`
}

document.addEventListener('DOMContentLoaded', () => {
  normalizeSidebar()
  const cookie = document.cookie.split('; ').find((item) => item.startsWith('konnix_doc_theme='))
  const saved = cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : localStorage.getItem('konnix-doc-theme') || 'default'
  document.body.insertAdjacentHTML('beforeend', themeMarkup())
  applyKonnixTheme(saved)
  document.querySelectorAll('[data-open-theme]').forEach((button) => button.addEventListener('click', () => document.querySelector('.kx-theme-backdrop').classList.add('open')))
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-theme-close]')
    if (target) document.querySelector('.kx-theme-backdrop').classList.remove('open')
    const option = event.target.closest('[data-theme-value]')
    if (option) applyKonnixTheme(option.dataset.themeValue)
  })
})

document.addEventListener('DOMContentLoaded', () => {
  const sectionLinks = ['elementos.html', 'formularios.html', 'tabelas.html', 'graficos.html']
  document.querySelectorAll('.kx-nav-section li a').forEach((link, index) => {
    if (sectionLinks[index]) link.href = sectionLinks[index]
  })
  const page = location.pathname.split('/').pop() || 'index.html'
  if (sectionLinks.includes(page)) document.querySelector('.kx-nav a[href="componentes.html"]')?.classList.add('active')
})
