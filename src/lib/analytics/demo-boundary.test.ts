import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

describe("demo module boundary", () => {
  it("cannot import the server database client", () => {
    const demoDirectory = join(process.cwd(), "src/lib/demo")
    const imports = filesBelow(demoDirectory)
      .filter((path) => /\.(ts|tsx)$/.test(path))
      .filter((path) => readFileSync(path, "utf8").includes("@/lib/supabase-server"))

    expect(imports).toEqual([])
  })

  it("keeps runtime store modules free of Node-only imports", () => {
    const demoDirectory = join(process.cwd(), "src/lib/demo")
    const imports = filesBelow(demoDirectory)
      .filter((path) => /store[^/]*\.ts$/.test(path) && !path.endsWith(".test.ts"))
      .filter((path) => /from ["'](?:node:|fs["']|path["'])/.test(readFileSync(path, "utf8")))

    expect(imports).toEqual([])
  })
})
