import type { ProductCategory } from "@/lib/dashboard/contract"

export const CATEGORY_RULES: ReadonlyArray<{ pattern: RegExp; category: ProductCategory }> = [
  { pattern: /booster\s+bundle/i, category: "Booster Bundle" },
  { pattern: /booster\s+(display|box)/i, category: "Booster Box" },
  { pattern: /elite\s+trainer\s+box|\bETB\b/i, category: "ETB" },
  { pattern: /\btins?\b/i, category: "Tin" },
  { pattern: /\bblisters?\b|checklane/i, category: "Blister" },
  { pattern: /ultra-premium|premium\s+tournament|build\s*&\s*battle|trainer'?s\s+toolkit/i, category: "Specialty" },
  { pattern: /collection|collector(?:'s)?\s+(?:chest|box)/i, category: "Collection Box" },
]

export function inferCategory(name: string): ProductCategory {
  return CATEGORY_RULES.find(({ pattern }) => pattern.test(name))?.category ?? "Uncategorized"
}

export function effectiveCategory(
  name: string,
  override: ProductCategory | null | undefined
): { category: ProductCategory; source: "override" | "inferred" } {
  return override
    ? { category: override, source: "override" }
    : { category: inferCategory(name), source: "inferred" }
}
