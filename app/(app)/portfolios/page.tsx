"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Trash2, FolderOpen } from "lucide-react"
import { Portfolio } from "@/lib/supabase"
import { getStarredPortfolioId, setStarredPortfolioId } from "@/lib/use-active-portfolio"

export default function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [starredId, setStarredId] = useState<string | null>(null)

  useEffect(() => { setStarredId(getStarredPortfolioId()) }, [])

  async function load() {
    const res = await fetch("/api/portfolios")
    const data = await res.json()

    // Auto-create "Main" portfolio on first use
    if (Array.isArray(data) && data.length === 0) {
      await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Main", description: null }),
      })
      const refreshed = await fetch("/api/portfolios").then((r) => r.json())
      setPortfolios(refreshed)
    } else {
      setPortfolios(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
    })
    if (res.ok) {
      const created = await res.json()
      setPortfolios((prev) => [...prev, created])
    }
    setNewName("")
    setNewDesc("")
    setShowForm(false)
    setCreating(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will remove all items in it.`)) return
    await fetch(`/api/portfolios/${id}`, { method: "DELETE" })
    setPortfolios((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your sealed product collections</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          New Portfolio
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border border-border rounded-lg p-5 space-y-3 bg-card">
          <h2 className="font-semibold text-sm">Create Portfolio</h2>
          <input
            autoFocus
            type="text"
            placeholder="Portfolio name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg border border-border bg-muted animate-pulse" />
          ))}
        </div>
      ) : portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-lg">
          <FolderOpen size={40} className="text-muted-foreground mb-3" />
          <p className="font-medium">No portfolios yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create one to start tracking your sealed products</p>
        </div>
      ) : (
        <div className="space-y-3">
          {portfolios.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border border-border rounded-lg p-4 bg-card hover:bg-accent/30 transition-colors group"
            >
              <Link href={`/portfolios/${p.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm">{p.name}</p>
                  {starredId === p.id && (
                    <span className="text-yellow-400 text-xs leading-none" title="Default portfolio">★</span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>
                )}
                <p className="hidden group-hover:block text-xs text-muted-foreground mt-1">
                  Created {new Date(p.created_at).toLocaleDateString()}
                </p>
              </Link>
              <div className="flex items-center gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  title={starredId === p.id ? "Remove default" : "Set as default portfolio"}
                  onClick={(e) => {
                    e.preventDefault()
                    const next = starredId === p.id ? null : p.id
                    setStarredPortfolioId(next)
                    setStarredId(next)
                  }}
                  className={`p-2 rounded-md transition-colors text-base leading-none ${
                    starredId === p.id
                      ? "text-yellow-400 hover:text-yellow-500"
                      : "text-muted-foreground/40 hover:text-yellow-400"
                  }`}
                >
                  ★
                </button>
                <button
                  onClick={() => handleDelete(p.id, p.name)}
                  className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
