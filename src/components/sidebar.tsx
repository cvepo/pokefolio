"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, FolderOpen, Search, Settings, LogOut, Moon, Sun, BarChart3, RefreshCw } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { cn, formatDateTimeShort } from "@/lib/utils"
import { triggerLabel, useSyncStatus } from "@/lib/use-sync-status"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolios", label: "Portfolios", icon: FolderOpen },
  { href: "/search", label: "Search", icon: Search },
  { href: "/data", label: "Data", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { lastRun, syncing, runSync } = useSyncStatus()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-card h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-border">
        <span className="font-bold text-lg tracking-tight">Pokéfolio</span>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        {/* Sync — available from any page, not just Settings. The timestamp
            below is read from the sync_runs log, so it persists across
            reloads and shows whether the run was scheduled or manual. */}
        <button
          onClick={() => runSync()}
          disabled={syncing}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        <p className="px-3 pb-1 text-[11px] leading-tight text-muted-foreground">
          {lastRun?.finished_at || lastRun?.started_at ? (
            <>
              <span className="block">
                Last sync {formatDateTimeShort(lastRun.finished_at ?? lastRun.started_at)}
              </span>
              <span
                className={cn(
                  "block",
                  lastRun.status === "failed" && "text-red-500",
                  lastRun.status === "partial" && "text-amber-500"
                )}
              >
                {triggerLabel(lastRun.trigger)}
                {lastRun.status === "skipped" && " · skipped"}
                {lastRun.status === "partial" && ` · ${lastRun.products_failed} failed`}
                {lastRun.status === "failed" && " · failed"}
                {lastRun.status === "success" && ` · ${lastRun.products_synced} products`}
              </span>
            </>
          ) : (
            <span className="block">No sync recorded yet</span>
          )}
        </p>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full transition-colors"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
