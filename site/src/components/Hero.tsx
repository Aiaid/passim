'use client'

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

export function Hero() {
  const t = useTranslations('Hero')

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-16">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[500px] h-[500px] rounded-full bg-cyan/[0.07] blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-purple/[0.07] blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
        {/* Text */}
        <div className="flex-1 text-center lg:text-left">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight tracking-tight"
          >
            <span className="text-gradient">{t('title1')}</span>
            <br />
            <span className="text-white">{t('title2')}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
            className="mt-6 text-lg sm:text-xl text-space-300 max-w-xl mx-auto lg:mx-0 leading-relaxed"
          >
            {t('subtitle')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
            className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
          >
            <a
              href="#quickstart"
              onClick={(e) => {
                e.preventDefault()
                document
                  .querySelector('#quickstart')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="px-8 py-3.5 rounded-full font-medium text-space-950 bg-gradient-to-r from-cyan to-[oklch(0.72_0.16_230)] hover:shadow-[0_0_30px_oklch(0.78_0.15_195/0.3)] transition-all duration-300"
            >
              {t('cta')}
            </a>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault()
                document
                  .querySelector('#features')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="px-8 py-3.5 rounded-full font-medium text-space-200 glass glass-hover transition-all duration-300"
            >
              {t('cta2')}
            </a>
          </motion.div>
        </div>

        {/* Dashboard screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
          className="flex-1 flex justify-center"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-full max-w-[600px]"
          >
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_60px_oklch(0_0_0/0.5)] glow-cyan">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/screenshots/dashboard.png"
                alt="Passim Dashboard"
                className="w-full h-auto"
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
