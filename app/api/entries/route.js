import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID, SHEET_NAME } from "@/lib/sheets";

export async function GET(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sheets = await getSheet();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:F1000`,
    });

    const rows = res.data.values || [];
    const entries = rows
      .filter(r => r[1] && r[2])
      .map((r, i) => {
        const rawTime = (r[2] || "").replace(/(\d{2})\.(\d{2})\.?(\d{2})?$/, (_, h, m) => `${h}:${m}:00`);
        return {
          id: i + 2,
          what: r[1] || "",
          time: new Date(rawTime).getTime(),
          amount: r[3] || null,
          unit: r[5] || "n/a",
        };
      })
      .filter(e => !isNaN(e.time))
      .sort((a, b) => b.time - a.time);

    return Response.json(entries);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { what, time, amount, unit } = await request.json();
    const sheets = await getSheet();
    const timestamp = new Date(time).toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["", what, timestamp, amount || "", "", unit || "n/a"]],
      },
    });

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
