import { DemoBanner } from "@/components/demo/demo-banner"
import { DemoSidebar } from "@/components/demo/demo-sidebar"

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
      <DemoBanner />
      <div className="flex min-h-0 flex-1">
        <DemoSidebar />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
