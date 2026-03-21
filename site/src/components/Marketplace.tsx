'use client'

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

const apps = [
  { key: 'wireguard', name: 'WireGuard', cat: 'vpn', accent: 'bg-cyan/15 text-cyan border-cyan/20' },
  { key: 'l2tp', name: 'L2TP/IPSec', cat: 'vpn', accent: 'bg-cyan/15 text-cyan border-cyan/20' },
  { key: 'hysteria', name: 'Hysteria', cat: 'proxy', accent: 'bg-purple/15 text-purple border-purple/20' },
  { key: 'v2ray', name: 'V2Ray', cat: 'proxy', accent: 'bg-purple/15 text-purple border-purple/20' },
  { key: 'webdav', name: 'WebDAV', cat: 'storage', accent: 'bg-amber/15 text-amber border-amber/20' },
  { key: 'samba', name: 'Samba', cat: 'storage', accent: 'bg-amber/15 text-amber border-amber/20' },
  { key: 'rdesktop', name: 'RDesktop', cat: 'remote', accent: 'bg-emerald/15 text-emerald border-emerald/20' },
]

const appIcons: Record<string, JSX.Element> = {
  wireguard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
      <path d="M12 3l8 4v5c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V7l8-4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  l2tp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 118 0v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  hysteria: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  v2ray: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  webdav: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  samba: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M12 6v12M2 12h20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  rdesktop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

export function Marketplace() {
  const t = useTranslations('Marketplace')

  return (
    <section id="marketplace" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
            <span className="text-gradient">{t('title')}</span>
          </h2>
          <p className="text-space-400 text-lg">{t('subtitle')}</p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {apps.map((app, i) => (
            <motion.div
              key={app.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="glass glass-hover rounded-xl p-5 transition-all duration-300 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-space-400 group-hover:text-space-200 transition-colors shrink-0">
                  {appIcons[app.key]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display font-semibold text-sm">
                      {app.name}
                    </h3>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${app.accent}`}
                    >
                      {t(app.cat)}
                    </span>
                  </div>
                  <p className="text-space-400 text-xs leading-relaxed">
                    {t(app.key)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
