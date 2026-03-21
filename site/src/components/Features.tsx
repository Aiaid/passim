'use client'

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

const featureIcons = [
  // Rocket - deploy
  <svg key="rocket" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <path d="M12 2C6.5 7 4 12 4 17l3.5-1L12 22l4.5-6L20 17c0-5-2.5-10-8-15z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // Shield check - SSL
  <svg key="shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 3l8 4v5c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V7l8-4z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // Globe - multi-node
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // Fingerprint - biometric
  <svg key="finger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <path d="M12 10v6M7.5 13c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" strokeLinecap="round" />
    <path d="M5 15c0-3.866 3.134-7 7-7s7 3.134 7 7" strokeLinecap="round" />
    <path d="M9.5 17c.3-1.5 1.2-3 2.5-3s2.2 1.5 2.5 3" strokeLinecap="round" />
  </svg>,
  // Chart - monitoring
  <svg key="chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 14l4-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // Refresh - auto update
  <svg key="update" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <path d="M4 4v5h5M20 20v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20.49 9A9 9 0 005.64 5.64L4 7m16 10l-1.64 1.36A9 9 0 013.51 15" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
]

export function Features() {
  const t = useTranslations('Features')

  const features = Array.from({ length: 6 }, (_, i) => ({
    icon: featureIcons[i],
    title: t(`f${i + 1}Title`),
    desc: t(`f${i + 1}Desc`),
  }))

  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="font-display text-3xl sm:text-4xl font-bold text-center mb-16"
        >
          <span className="text-gradient">{t('title')}</span>
        </motion.h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass glass-hover rounded-2xl p-7 transition-all duration-300 group hover:glow-cyan"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-space-400 group-hover:text-cyan group-hover:bg-cyan/10 transition-all duration-300 mb-5">
                {f.icon}
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">
                {f.title}
              </h3>
              <p className="text-space-400 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
