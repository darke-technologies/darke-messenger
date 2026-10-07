import { NextRequest, NextResponse } from "next/server";
import {
  igdbIsConfigured,
  listIgdbGames,
  loadIgdbGameDetail,
} from "./server";

export async function GET(req: NextRequest) {
  const op = req.nextUrl.searchParams.get("op") ?? "";
  try {
    if (op === "configured") {
      return NextResponse.json({ configured: igdbIsConfigured() });
    }
    if (op === "games") {
      const yearRaw = req.nextUrl.searchParams.get("year") ?? "";
      const year = yearRaw ? Number(yearRaw) : null;
      const page = Number(req.nextUrl.searchParams.get("page") ?? "1") || 1;
      const data = await listIgdbGames({
        page,
        genre: req.nextUrl.searchParams.get("genre") ?? "trending",
        search: req.nextUrl.searchParams.get("search") ?? "",
        sort: req.nextUrl.searchParams.get("sort") ?? "newest",
        year: year != null && Number.isFinite(year) ? year : null,
      });
      return NextResponse.json(data);
    }
    if (op === "game") {
      const id = Number(req.nextUrl.searchParams.get("id") ?? "0");
      const data = await loadIgdbGameDetail(id);
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Unknown IGDB op." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(message, { status: 400 });
  }
}
