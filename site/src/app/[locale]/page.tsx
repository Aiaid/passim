import { StarField } from '@/components/StarField'
import { Navbar } from '@/components/Navbar'
import { Hero } from '@/components/Hero'
import { PainPoints } from '@/components/PainPoints'
import { Solution } from '@/components/Solution'
import { Features } from '@/components/Features'
import { Marketplace } from '@/components/Marketplace'
import { HowItWorks } from '@/components/HowItWorks'
import { Comparison } from '@/components/Comparison'
import { TechStack } from '@/components/TechStack'
import { QuickStart } from '@/components/QuickStart'
import { Footer } from '@/components/Footer'

export default function HomePage() {
  return (
    <>
      <StarField />
      <Navbar />
      <main className="relative z-10">
        <Hero />
        <PainPoints />
        <Solution />
        <Features />
        <Marketplace />
        <HowItWorks />
        <Comparison />
        <TechStack />
        <QuickStart />
      </main>
      <Footer />
    </>
  )
}
