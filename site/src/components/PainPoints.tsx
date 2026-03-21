'use client'

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

const icons = [
  // Terminal
  <svg key="terminal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
    <path d="M4 17l6-6-6-6M12 19h8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // Lock
  <svg key="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
    <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 11V7a4 4 0 118 0v4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // Refresh
  <svg key="refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
    <path d="M4 4v5h5M20 20v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20.49 9A9 9 0 005.64 5.64L4 7m16 10l-1.64 1.36A9 9 0 013.51 15" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
]

export function PainPoints() {
  const t = useTranslations('PainPoints')

  const items = [
    { icon: icons[0], title: t('item1Title'), desc: t('item1Desc') },
    { icon: icons[1], title: t('item2Title'), desc: t('item2Desc') },
    { icon: icons[2], title: t('item3Title'), desc: t('item3Desc') },
  ]

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="font-display text-3xl sm:text-4xl font-bold text-center mb-16"
        >
          {t('title')}
          <span className="text-gradient">{t('titleHighlight')}</span>
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="glass glass-hover rounded-2xl p-8 transition-all duration-300 group"
            >
              <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-space-400 group-hover:text-cyan group-hover:bg-cyan/10 transition-all duration-300 mb-6">
                {item.icon}
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">
                {item.title}
              </h3>
              <p className="text-space-400 leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
