import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID } from "@/lib/sheets";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sheets = await getSheet();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `birth!A1`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const val = res.data.values?.[0]?.[0];
    if (!val) return Response.json({ error: "No birth date" }, { status: 404 });
    // Convert sheet serial to timestamp
    const utcMs = Math.round((parseFloat(val) - 25569) * 86400 * 1000);
    const roundedMs = Math.round(utcMs / 60000) * 60000;
    const offsetHours = new Date(roundedMs).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', timeZoneName: 'short' }).match(/GMT([+-]\d+)/)?.[1];
    const offset = offsetHours ? parseInt(offsetHours) : 2;
    const ts = roundedMs - (offset * 3600 * 1000);
    return Response.json({ ts });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}