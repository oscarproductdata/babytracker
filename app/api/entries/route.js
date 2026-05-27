import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID, SHEET_NAME } from "@/lib/sheets";

function parseSheetDate(val) {
  if (!val) return NaN;
  const num = parseFloat(val);
  if (!isNaN(num) && num > 40000) {
    const utcMs = (num - 25569) * 86400 * 1000;
    const roundedMs = Math.round(utcMs / 60000) * 60000;
    const offsetHours = new Date(roundedMs).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', timeZoneName: 'short' }).match(/GMT([+-]\d+)/)?.[1];
    const offset = offsetHours ? parseInt(offsetHours) : 2;
    return roundedMs - (offset * 3600 * 1000);
  }
  // Handle text format like "26-05-19 00.30"
  if (typeof val === 'string') {
    const match = val.match(/^(\d{2})-(\d{2})-(\d{2})\s+(\d{2})\.(\d{2})$/);
    if (match) {
      const [_, yy, mm, dd, hh, min] = match;
      const isoStr = `20${yy}-${mm}-${dd}T${hh}:${min}:00`;
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  return NaN;
}

function toStockholmSerial(ts) {
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
      range: `${SHEET_NAME}!A2:H1000`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = res.data.values || [];
    console.log('Total rows:', rows.length);
    console.log('First row:', JSON.stringify(rows[0]));
    
    const entries = rows
      .filter(r => r[1] && r[2])
      .map((r, i) => ({
        id: i + 2,
        what: r[1] || "",
        time: parseSheetDate(r[2]),
        amount: r[3] || null,
        unit: r[5] || "n/a",
        amountL: r[6] || null,
        amountR: r[7] || null,
      }))
      .filter(e => !isNaN(e.time))
      .sort((a, b) => b.time - a.time);

    console.log('Parsed entries:', entries.length);
    return Response.json(entries);
  } catch (e) {
    console.error('GET error:', e.message, e.stack);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { what, time, amount, unit, amountL, amountR } = await request.json();
    const sheets = await getSheet();
    const serial = toStockholmSerial(time);

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!B:B`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const nextRow = (readRes.data.values || []).length + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!B${nextRow}:H${nextRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[what, serial, amount || "", "", unit || "n/a", amountL || "", amountR || ""]] },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: nextRow - 1,
              endRowIndex: nextRow,
              startColumnIndex: 2,
              endColumnIndex: 3,
            },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "yy-MM-dd HH.mm" } } },
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