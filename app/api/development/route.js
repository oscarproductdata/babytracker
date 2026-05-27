import { getServerSession } from "next-auth";
import { getSheet, SHEET_ID } from "@/lib/sheets";

const DEV_SHEET = "development";

export async function POST(request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { week } = await request.json();
    const sheets = await getSheet();

    // Check if week already exists in sheet
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${DEV_SHEET}!A:B`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = existing.data.values || [];
    const found = rows.find(r => String(r[0]) === String(week));
    if (found && found[1]) {
      return Response.json(JSON.parse(found[1]));
    }

    // Not found — call Claude
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'You are a pediatric development expert. Respond ONLY with a JSON object, no markdown, no backticks. The JSON must have these keys: "title" (string), "summary" (string, 1-2 sentences), "summarySource" (object with "name" and "url"), "milestones" (array of 3-4 strings), "milestonesSource" (object with "name" and "url"), "tips" (array of 3-4 strings), "tipsSource" (object with "name" and "url"), "watchFor" (array of 2-3 strings), "watchForSource" (object with "name" and "url"). Use reputable sources like WHO, CDC, AAP, 1177.se, rikshandboken.se. All content in Swedish except URLs.',
        messages: [{ role: 'user', content: `Baby is ${week} weeks old. Give developmental info for week ${week}.` }]
      })
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const parsed = JSON.parse(text);

    // Save to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${DEV_SHEET}!A:B`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[week, JSON.stringify(parsed)]] },
    });

    return Response.json({ ...parsed, _usage: data.usage });
  } catch (e) {
    console.error('Development API error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}