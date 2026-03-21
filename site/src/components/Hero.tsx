'use client'

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

function DashboardMockup() {
  const metrics = [
    { label: 'CPU', value: '72%', color: 'text-cyan' },
    { label: 'MEM', value: '45%', color: 'text-purple' },
    { label: 'DISK', value: '28%', color: 'text-amber' },
    { label: 'NET', value: '1.2G', color: 'text-emerald' },
  ]

  return (
    <div className="glass rounded-2xl overflow-hidden w-full max-w-[520px] border border-white/10 shadow-[0_20px_60px_oklch(0_0_0/0.5)]">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.svg" alt="Passim" className="h-3 ml-2 opacity-50" />
      </div>

      <div className="flex min-h-[220px]">
        {/* Sidebar */}
        <div className="w-11 border-r border-white/5 py-3 flex flex-col items-center gap-3 bg-white/[0.01]">
          {[true, false, false, false].map((active, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-md ${
                active
                  ? 'bg-cyan/20 border border-cyan/30'
                  : 'bg-white/5'
              }`}
            />
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-4 space-y-3">
          {/* Metrics */}
          <div className="grid grid-cols-4 gap-2">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-center"
              >
                <div className="text-[9px] text-space-500 uppercase tracking-wider">
                  {m.label}
                </div>
                <div className={`text-sm font-bold font-mono mt-0.5 ${m.color}`}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3 h-[68px]">
            <svg
              viewBox="0 0 200 32"
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="oklch(0.78 0.15 195)"
                    stopOpacity="0.3"
                  />
                  <stop
                    offset="100%"
                    stopColor="oklch(0.78 0.15 195)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <path
                d="M0,26 C15,22 25,20 40,16 S60,10 80,14 S100,6 120,12 S140,8 160,10 S180,4 200,8 V32 H0 Z"
                fill="url(#cg)"
              />
              <path
                d="M0,26 C15,22 25,20 40,16 S60,10 80,14 S100,6 120,12 S140,8 160,10 S180,4 200,8"
                fill="none"
                stroke="oklch(0.78 0.15 195)"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          {/* Running apps */}
          <div className="flex gap-2">
            {['WireGuard', 'WebDAV'].map((name) => (
              <div
                key={name}
                className="flex items-center gap-1.5 rounded-md bg-white/[0.03] border border-white/5 px-2.5 py-1.5"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
                <span className="text-[11px] text-space-300">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

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

        {/* Dashboard mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
          className="flex-1 flex justify-center"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <DashboardMockup />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
