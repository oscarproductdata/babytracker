import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID } from "@/lib/sheets";

const DEV_SHEET = "development";

export async function POST(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { week } = await request.json();
    const sheets = await getSheet();

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${DEV_SHEET}!A:A`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = existing.data.values || [];
    const rowIndex = rows.findIndex(r => String(r[0]) === String(week));
    if (rowIndex === -1) return Response.json({ success: true });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${DEV_SHEET}!A${rowIndex + 1}:B${rowIndex + 1}`,
    });

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}