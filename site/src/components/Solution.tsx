'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

export function Solution() {
  const t = useTranslations('Solution')
  const [copied, setCopied] = useState(false)
  const cmd = 'curl -fsSL https://get.passim.io | sudo bash'

  const handleCopy = () => {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="py-24 px-6 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-cyan/[0.04] blur-[150px]" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
        >
          <p className="text-cyan font-mono text-sm tracking-wider uppercase mb-4">
            {t('label')}
          </p>
          <h2 className="font-display text-3xl sm:text-5xl font-bold mb-4">
            {t('title').split('Passim')[0]}
            <span className="text-gradient">Passim</span>
          </h2>
          <p className="font-display text-xl sm:text-2xl text-space-300 mb-8">
            {t('subtitle')}
          </p>
          <p className="text-space-400 text-lg max-w-2xl mx-auto mb-12 leading-relaxed">
            {t('desc')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="glass rounded-2xl p-1 max-w-2xl mx-auto glow-cyan"
        >
          <div className="flex items-center gap-4 bg-space-950/50 rounded-xl px-5 py-4">
            <span className="text-cyan font-mono text-sm shrink-0">$</span>
            <code className="font-mono text-sm text-space-100 flex-1 text-left overflow-x-auto whitespace-nowrap">
              {cmd}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-space-400 hover:text-white transition-all text-sm cursor-pointer"
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 flex items-center justify-center gap-6 text-sm text-space-500"
        >
          <span>{t('tag1')}</span>
          <span className="w-1 h-1 rounded-full bg-space-600" />
          <span>{t('tag2')}</span>
          <span className="w-1 h-1 rounded-full bg-space-600" />
          <span>{t('tag3')}</span>
        </motion.div>
      </div>
    </section>
  )
}
