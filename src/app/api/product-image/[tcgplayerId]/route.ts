import { NextResponse } from "next/server"
import { getProductImage } from "@/lib/images/product-image"

/**
 * Background-removed product thumbnail.
 *
 * Serves a PNG cut out of TCGplayer's white-background JPEG, cached in Supabase
 * Storage after the first request. Long cache headers because a given product
 * photo never changes — only the rendition size varies, and that is in the URL.
 *
 * Note this does NOT count against the pricing API budget: TCGplayer's image
 * CDN is separate from the JustTCG pricing API that PRD §21 protects.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tcgplayerId: string }> }
) {
  const { tcgplayerId } = await params
  if (!/^\d+$/.test(tcgplayerId)) {
    return NextResponse.json({ error: "Invalid product image id" }, { status: 400 })
  }

  const requested = Number.parseInt(
    new URL(request.url).searchParams.get("size") ?? "128",
    10
  )

  try {
    const image = await getProductImage(tcgplayerId, Number.isFinite(requested) ? requested : 128)
    // A product with no photo is an ordinary outcome, not a failure — the tile
    // simply renders without one.
    if (!image) return new NextResponse(null, { status: 404 })

    // Redirect to storage rather than proxying the bytes: the CDN serves it and
    // the browser caches it, instead of every thumbnail crossing this server on
    // every dashboard load.
    return NextResponse.redirect(image.url, {
      status: 307,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Image-Cache": image.generated ? "MISS" : "HIT",
      },
    })
  } catch (error) {
    console.error("[product-image]", error)
    return new NextResponse(null, { status: 502 })
  }
}
