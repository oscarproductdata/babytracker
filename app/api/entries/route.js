import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID, SHEET_NAME } from "@/lib/sheets";

function parseSheetDate(val) {
  if (!val) return NaN;
  // If it's a number, it's a Google Sheets serial date
  const num = parseFloat(val);
  if (!isNaN(num) && num > 1000) {
    // Google Sheets epoch is December 30, 1899
    return new Date((num - 25569) * 86400 * 1000).getTime();
  }
  // Try replacing dots with colons for time part
  const fixed = String(val)
    .replace(/^(\d{2})-(\d{2})-(\d{2})/, '20$3-$2-$1')
    .replace(/(\d{2})\.(\d{2})(\.(\d{2}))?$/, '$1:$2:00');
  const d = new Date(fixed);
  if (!isNaN(d.getTime())) return d.getTime();
  return NaN;
}

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
      .map((r, i) => ({
        id: i + 2,
        what: r[1] || "",
        time: parseSheetDate(r[2]),
        amount: r[3] || null,
        unit: r[5] || "n/a",
      }))
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
