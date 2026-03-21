'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'

const navLinks = [
  { key: 'features', href: '#features' },
  { key: 'apps', href: '#marketplace' },
  { key: 'compare', href: '#comparison' },
  { key: 'start', href: '#quickstart' },
] as const

export function Navbar() {
  const t = useTranslations('Navbar')
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const locale = pathname.startsWith('/en') ? 'en' : 'zh'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (href: string) => {
    setMenuOpen(false)
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
  }

  const switchLocale = () => {
    const next = locale === 'zh' ? '/en' : '/zh'
    router.push(next)
  }

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-space-950/80 backdrop-blur-xl border-b border-white/5'
          : ''
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <img
          src="/logo-white.svg"
          alt="Passim"
          className="h-7"
        />

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.key}
              onClick={() => scrollTo(link.href)}
              className="text-sm text-space-300 hover:text-white transition-colors cursor-pointer"
            >
              {t(link.key)}
            </button>
          ))}
          <button
            onClick={switchLocale}
            className="text-sm text-space-400 hover:text-white transition-colors cursor-pointer px-2.5 py-1 rounded-md border border-white/5 hover:border-white/10"
          >
            {locale === 'zh' ? 'EN' : '中文'}
          </button>
          <button
            onClick={() => scrollTo('#quickstart')}
            className="px-5 py-2 text-sm font-medium rounded-full bg-cyan/10 text-cyan border border-cyan/20 hover:bg-cyan/20 transition-all cursor-pointer"
          >
            {t('start')}
          </button>
        </div>

        {/* Mobile hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={switchLocale}
            className="text-sm text-space-400 hover:text-white transition-colors cursor-pointer"
          >
            {locale === 'zh' ? 'EN' : '中文'}
          </button>
          <button
            className="text-white cursor-pointer p-1"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {menuOpen ? (
                <path
                  d="M6 6l12 12M6 18L18 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M4 8h16M4 16h16"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-space-950/95 backdrop-blur-xl border-b border-white/5 px-6 pb-6 pt-2"
        >
          {navLinks.map((link) => (
            <button
              key={link.key}
              onClick={() => scrollTo(link.href)}
              className="block w-full text-left py-3 text-space-200 hover:text-white transition-colors cursor-pointer"
            >
              {t(link.key)}
            </button>
          ))}
        </motion.div>
      )}
    </motion.nav>
  )
}
