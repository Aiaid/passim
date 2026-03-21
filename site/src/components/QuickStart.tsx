'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

function CodeBlock({
  label,
  code,
  copyText,
  copiedText,
}: {
  label: string
  code: string
  copyText: string
  copiedText: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <span className="text-xs text-space-400 font-mono">{label}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-space-400 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-white/5"
        >
          {copied ? copiedText : copyText}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm font-mono text-space-200">{code}</code>
      </pre>
    </div>
  )
}

export function QuickStart() {
  const t = useTranslations('QuickStart')

  const installerCmd = 'curl -fsSL https://raw.githubusercontent.com/aiaid/passim/main/install.sh | sudo bash'
  const dockerCmd = `docker run -d \\
  --name passim \\
  --restart always \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v passim-data:/data \\
  -p 8443:8443 -p 80:80 \\
  ghcr.io/aiaid/passim:latest`

  return (
    <section id="quickstart" className="py-24 px-6 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-cyan/[0.03] blur-[150px]" />
      </div>

      <div className="relative max-w-3xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="font-display text-3xl sm:text-4xl font-bold text-center mb-16"
        >
          <span className="text-gradient">{t('title')}</span>
        </motion.h2>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <CodeBlock
              label={t('method1')}
              code={installerCmd}
              copyText={t('copy')}
              copiedText={t('copied')}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <CodeBlock
              label={t('method2')}
              code={dockerCmd}
              copyText={t('copy')}
              copiedText={t('copied')}
            />
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 text-center text-sm text-space-500"
        >
          {t('note')}
        </motion.p>
      </div>
    </section>
  )
}
