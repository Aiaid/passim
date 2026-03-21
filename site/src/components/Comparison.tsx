'use client'

import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

const Check = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-emerald">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
)

const Cross = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-space-600">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
)

export function Comparison() {
  const t = useTranslations('Comparison')

  const rows = [
    {
      label: t('difficulty'),
      manual: <span className="text-red-400 text-sm">{t('hard')}</span>,
      portainer: <span className="text-amber text-sm">{t('medium')}</span>,
      passim: <span className="text-emerald text-sm font-medium">{t('easy')}</span>,
    },
    {
      label: t('presetApps'),
      manual: <Cross />,
      portainer: <span className="text-space-400 text-sm">{t('limited')}</span>,
      passim: <span className="text-emerald text-sm">{t('7apps')}</span>,
    },
    {
      label: t('autoSSL'),
      manual: <Cross />,
      portainer: <Cross />,
      passim: <span className="text-emerald text-sm">{t('noDomain')}</span>,
    },
    {
      label: t('biometric'),
      manual: <Cross />,
      portainer: <Cross />,
      passim: <Check />,
    },
    {
      label: t('autoUpdate'),
      manual: <Cross />,
      portainer: <Cross />,
      passim: <Check />,
    },
    {
      label: t('multiNode'),
      manual: <Cross />,
      portainer: <span className="text-space-400 text-sm">{t('centralized')}</span>,
      passim: <span className="text-emerald text-sm">{t('decentralized')}</span>,
    },
    {
      label: t('audience'),
      manual: <span className="text-space-400 text-sm">{t('expert')}</span>,
      portainer: <span className="text-space-400 text-sm">{t('developer')}</span>,
      passim: <span className="text-cyan text-sm font-medium">{t('everyone')}</span>,
    },
  ]

  return (
    <section id="comparison" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="font-display text-3xl sm:text-4xl font-bold text-center mb-16"
        >
          {t('title')}
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="glass rounded-2xl overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-sm text-space-400 font-normal p-4 w-[30%]" />
                  <th className="text-center text-sm text-space-400 font-normal p-4">
                    {t('manual')}
                  </th>
                  <th className="text-center text-sm text-space-400 font-normal p-4">
                    {t('portainer')}
                  </th>
                  <th className="text-center text-sm font-medium p-4 text-cyan relative">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan to-transparent" />
                    {t('passim')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      i < rows.length - 1 ? 'border-b border-white/5' : ''
                    }
                  >
                    <td className="p-4 text-sm text-space-200">{row.label}</td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center">{row.manual}</div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center">{row.portainer}</div>
                    </td>
                    <td className="p-4 text-center bg-cyan/[0.03]">
                      <div className="flex justify-center">{row.passim}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
