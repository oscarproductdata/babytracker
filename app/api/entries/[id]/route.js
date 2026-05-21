import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID, SHEET_NAME } from "@/lib/sheets";

function toStockholmSerial(ts) {
  const stockholmStr = new Date(ts).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const stockholmDate = new Date(stockholmStr);
  const serial = (stockholmDate.getTime() / 86400000) + 25569 + (stockholmDate.getTimezoneOffset() / 1440);
  return serial;
}

export async function PUT(request, context) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const row = parseInt(id);
    const { what, time, amount, unit } = await request.json();
    const sheets = await getSheet();
    const serial = toStockholmSerial(time);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${row}:F${row}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["", what, serial, amount || "", "", unit || "n/a"]],
      },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: row - 1,
              endRowIndex: row,
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

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request, context) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const row = parseInt(id);
    const sheets = await getSheet();

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${row}:F${row}`,
    });

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
