import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID, SHEET_NAME } from "@/lib/sheets";

export async function GET(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sheets = await getSheet();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:H5`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return Response.json({ rows: res.data.values });
  } catch (e) {
    return Response.json({ error: e.message });
  }
}