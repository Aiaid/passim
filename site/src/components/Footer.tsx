'use client'

import { useTranslations } from 'next-intl'

export function Footer() {
  const t = useTranslations('Footer')

  return (
    <footer className="relative z-10 border-t border-white/5 py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src="/logo-white.svg" alt="Passim" className="h-5" />
          <span className="text-space-500 text-sm">{t('tagline')}</span>
        </div>

        <div className="flex items-center gap-6 text-sm text-space-400">
          <a
            href="https://github.com/aiaid/passim"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            {t('github')}
          </a>
          <a
            href="https://github.com/aiaid/passim/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            {t('license')}
          </a>
        </div>

        <p className="text-xs text-space-600">
          &copy; {new Date().getFullYear()} {t('copyright')}
        </p>
      </div>
    </footer>
  )
}
