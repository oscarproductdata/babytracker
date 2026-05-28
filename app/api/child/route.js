import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID } from "@/lib/sheets";

export async function GET(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sheets = await getSheet();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `children!A2:F100`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = res.data.values || [];
    const email = session.user.email?.toLowerCase();
    console.log('Child route - rows:', rows.length, 'email:', email);
    console.log('First row:', JSON.stringify(rows[0]));

    const parseBirthTs = (val) => {
      if (!val) return null;
      if (typeof val === 'number') return (val - 25569) * 86400 * 1000;
      const match = String(val).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})\.(\d{2})/);
      if (match) {
        const [_, y, m, d, h, min] = match;
        return new Date(`${y}-${m}-${d}T${h}:${min}:00`).getTime();
      }
      return null;
    };

    const children = rows
      .filter(r => {
        const emails = (r[5] || '').split(',').map(e => e.trim().toLowerCase());
        return emails.includes(email);
      })
      .map(r => ({
        child_id: r[0],
        firstName: r[1],
        lastName: r[2],
        birthTs: parseBirthTs(r[3]),
        dueDate: parseBirthTs(r[4]),
        parentEmails: (r[5] || '').split(',').map(e => e.trim()),
      }));

    return Response.json(children);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
    const session = await getServerSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  
    try {
      const { firstName, lastName, birthTs, dueDate } = await request.json();
      const sheets = await getSheet();
  
      const child_id = `${firstName.toLowerCase()}_${Date.now()}`;
      const email = session.user.email;
  
      const formatTs = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).replace('T', ' ').substring(0, 16).replace(':', '.').replace(':', '.');
      };
  
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `children!A:F`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[child_id, firstName, lastName, formatTs(birthTs), formatTs(dueDate), email]] },
      });
  
      return Response.json({ success: true, child_id });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  export async function PUT(request) {
    const session = await getServerSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  
    try {
      const { child_id, email } = await request.json();
      const sheets = await getSheet();
  
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `children!A:F`,
        valueRenderOption: "UNFORMATTED_VALUE",
      });
  
      const rows = res.data.values || [];
      const rowIndex = rows.findIndex(r => r[0] === child_id);
      if (rowIndex === -1) return Response.json({ error: "Child not found" }, { status: 404 });
  
      const row = rows[rowIndex];
      const emails = (row[5] || '').split(',').map(e => e.trim()).filter(Boolean);
      if (emails.includes(email.toLowerCase())) return Response.json({ error: "Already shared" }, { status: 400 });
      emails.push(email.toLowerCase().trim());
  
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `children!F${rowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[emails.join(',')]] },
      });
  
      return Response.json({ success: true });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }