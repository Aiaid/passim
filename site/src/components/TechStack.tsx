'use client'

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

const techs = [
  { name: 'Go 1.25', color: 'text-cyan border-cyan/20 bg-cyan/5' },
  { name: 'React 19', color: 'text-[#61dafb] border-[#61dafb]/20 bg-[#61dafb]/5' },
  { name: 'TypeScript', color: 'text-[#3178c6] border-[#3178c6]/20 bg-[#3178c6]/5' },
  { name: 'SQLite', color: 'text-amber border-amber/20 bg-amber/5' },
  { name: 'Docker SDK', color: 'text-[#2496ed] border-[#2496ed]/20 bg-[#2496ed]/5' },
  { name: 'amd64 + arm64', color: 'text-purple border-purple/20 bg-purple/5' },
]

export function TechStack() {
  const t = useTranslations('TechStack')

  return (
    <section className="py-24 px-6 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[300px] rounded-full bg-purple/[0.04] blur-[120px]" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
            {t('title')}
          </h2>
          <p className="text-space-400 text-lg mb-12 max-w-xl mx-auto">
            {t('desc')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-3 mb-12"
        >
          {techs.map((tech) => (
            <span
              key={tech.name}
              className={`px-4 py-2 rounded-full text-sm font-mono border ${tech.color}`}
            >
              {tech.name}
            </span>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <a
            href="https://github.com/aiaid/passim"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass glass-hover text-space-200 hover:text-white transition-all"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            {t('github')}
          </a>
        </motion.div>
      </div>
    </section>
  )
}
