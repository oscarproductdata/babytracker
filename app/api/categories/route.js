import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID } from "@/lib/sheets";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sheets = await getSheet();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `categories!A:C`,
    });
    const rows = res.data.values || [];
    const categories = rows
        .filter(r => r[0])
        .map(r => ({ name: r[0], emoji: r[1] || '', unit: r[2] || 'n/a' }));
    return Response.json(categories);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { categories } = await request.json();
    const sheets = await getSheet();

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `categories!A:C`,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `categories!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: categories.map(c => [c.name, c.emoji || '', c.unit || 'n/a']),
      },
    });

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}