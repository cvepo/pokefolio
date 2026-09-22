"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
  Moon,
  Sun,
  BarChart3,
  LineChart,
} from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/demo", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/demo/portfolios", label: "Portfolios", icon: FolderOpen },
  { href: "/demo/compare", label: "Compare", icon: LineChart },
  { href: "/demo/search", label: "Search", icon: Search },
  { href: "/demo/data", label: "Data", icon: BarChart3 },
  { href: "/demo/settings", label: "Settings", icon: Settings },
]

export function DemoSidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-card h-full sticky top-0">
      <div className="px-4 py-5 border-b border-border">
        <span className="font-bold text-lg tracking-tight">Pokéfolio</span>
        <p className="text-[11px] text-muted-foreground mt-0.5">Demo</p>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href || pathname === `${href}/`
            : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        <p className="px-3 pb-1 text-[11px] leading-tight text-muted-foreground">
          Sync is off in the demo — sample prices are frozen.
        </p>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full transition-colors"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </div>
    </aside>
  )
}
