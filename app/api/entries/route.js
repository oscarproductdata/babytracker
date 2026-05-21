import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID, SHEET_NAME } from "@/lib/sheets";

function parseSheetDate(val) {
  if (!val) return NaN;
  const num = parseFloat(val);
  if (!isNaN(num) && num > 40000) {
    return Math.round((num - 25569) * 86400 * 1000);
  }
  return NaN;
}

function toStockholmSerial(ts) {
  // Get Stockholm offset in ms
  const stockholmStr = new Date(ts).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const stockholmDate = new Date(stockholmStr);
  const serial = (stockholmDate.getTime() / 86400000) + 25569 + (stockholmDate.getTimezoneOffset() / 1440);
  return serial;
}

export async function GET(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sheets = await getSheet();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:F1000`,
      valueRenderOption: "UNFORMATTED_VALUE",
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
    const serial = toStockholmSerial(time);

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["", what, serial, amount || "", "", unit || "n/a"]],
      },
    });

    // Format the timestamp cell as date+time
    const updatedRange = appendRes.data.updates.updatedRange;
    const rowMatch = updatedRange.match(/(\d+)$/);
    if (rowMatch) {
      const rowIndex = parseInt(rowMatch[1]) - 1;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 2,
                endColumnIndex: 3,
              },
              cell: {
                userEnteredFormat: {
                  numberFormat: {
                    type: "DATE_TIME",
                    pattern: "yy-MM-dd HH.mm",
                  }
                }
              },
              fields: "userEnteredFormat.numberFormat",
            }
          }]
        }
      });
    }

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
