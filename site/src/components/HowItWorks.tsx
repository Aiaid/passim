'use client'

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

const stepIcons = [
  // Download/Install
  <svg key="install" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // Browser/Open
  <svg key="open" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <rect x="2" y="3" width="20" height="18" rx="2" />
    <path d="M2 9h20" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="5.5" cy="6" r="0.5" fill="currentColor" />
    <circle cx="8" cy="6" r="0.5" fill="currentColor" />
    <circle cx="10.5" cy="6" r="0.5" fill="currentColor" />
  </svg>,
  // Deploy/Launch
  <svg key="deploy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <path d="M12 2C6.5 7 4 12 4 17l3.5-1L12 22l4.5-6L20 17c0-5-2.5-10-8-15z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
]

export function HowItWorks() {
  const t = useTranslations('HowItWorks')

  const steps = [
    { num: '01', title: t('step1Title'), desc: t('step1Desc'), icon: stepIcons[0] },
    { num: '02', title: t('step2Title'), desc: t('step2Desc'), icon: stepIcons[1] },
    { num: '03', title: t('step3Title'), desc: t('step3Desc'), icon: stepIcons[2] },
  ]

  return (
    <section className="py-24 px-6 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] rounded-full bg-purple/[0.05] blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="font-display text-3xl sm:text-4xl font-bold text-center mb-16"
        >
          <span className="text-gradient">{t('title')}</span>
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line (desktop) */}
          <div className="hidden md:block absolute top-14 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-cyan/30 via-purple/30 to-emerald/30" />

          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.2 }}
              className="text-center relative"
            >
              {/* Step number */}
              <div className="relative z-10 w-14 h-14 rounded-2xl glass mx-auto mb-6 flex items-center justify-center text-cyan">
                {step.icon}
              </div>

              <div className="font-mono text-xs text-space-600 mb-2">
                {step.num}
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">
                {step.title}
              </h3>
              <p className="text-space-400 leading-relaxed max-w-xs mx-auto">
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
