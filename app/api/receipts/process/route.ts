import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

const EXTRACTION_PROMPT = `אתה מנתח קבלות סופרמרקט. הקלט הוא תמונה של קבלה (לרוב בעברית, מטבע ש"ח/ILS).
החזר אך ורק JSON תקין במבנה הבא, ללא שום טקסט מסביב, ללא markdown:

{
  "vendor_name": "שם החנות (לדוגמה: שופרסל, רמי לוי, ויקטורי). אם לא ברור, החזר null",
  "currency": "ILS",
  "total": מספר - הסכום הכולל של הקבלה (או null),
  "items": [
    {
      "name": "שם המוצר בעברית, מנוקה ממספרי מוצר/ברקודים",
      "barcode": "מספר ברקוד (7-13 ספרות) אם מופיע ליד הפריט, אחרת null",
      "quantity": מספר (ברירת מחדל 1),
      "unit_price": מספר - מחיר ליחידה,
      "line_total": מספר - סך הכול עבור השורה
    }
  ]
}

חשוב:
- דלג על שורות שאינן פריטים (סיכומים, הנחות כלליות, מס, אופן תשלום, מספר עוסק וכו').
- אם רואים "1 X 12.90" או "2X3.50" - quantity ו-unit_price בהתאם.
- אם רק line_total ידוע, השאר unit_price כ-line_total/quantity.
- ערכים מספריים תמיד כמספרים (לא מחרוזות).
- ברקודים הם מספרים של 7-13 ספרות שמופיעים בדרך כלל ליד כל פריט בקבלה.
- אם לא בטוח, החזר את הערך הקרוב ביותר; אל תשמיט שורה רק כי לא בטוח.
- JSON בלבד. ללא הסברים.`;

export async function POST(request: NextRequest) {
  try {
    if (!geminiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured on server" },
        { status: 500 }
      );
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase env vars not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { image_base64, local_user_id, list_id } = body as {
      image_base64?: string;
      local_user_id?: string;
      list_id?: string | null;
    };

    if (!image_base64) {
      return NextResponse.json({ error: "image_base64 required" }, { status: 400 });
    }
    if (!local_user_id) {
      return NextResponse.json({ error: "local_user_id required" }, { status: 400 });
    }

    // Strip data URL prefix if present
    const base64Match = image_base64.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    const mimeType = base64Match?.[1] || "image/jpeg";
    const rawBase64 = base64Match?.[2] || image_base64;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Create receipt row in 'processing' state
    const { data: receiptRow, error: insertErr } = await supabase
      .from("receipts")
      .insert({
        local_user_id,
        list_id: list_id || null,
        status: "processing",
        image_base64: image_base64,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Receipt insert failed:", insertErr);
      return NextResponse.json(
        { error: `DB insert failed: ${insertErr.message}` },
        { status: 500 }
      );
    }

    const receiptId = receiptRow.id;

    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      });

      const result = await model.generateContent([
        EXTRACTION_PROMPT,
        { inlineData: { data: rawBase64, mimeType } },
      ]);

      const text = result.response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Try to find JSON in the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Gemini did not return valid JSON");
        parsed = JSON.parse(jsonMatch[0]);
      }

      const vendor = typeof parsed.vendor_name === "string" ? parsed.vendor_name.trim() : null;
      const total = typeof parsed.total === "number" ? parsed.total : null;
      const items = Array.isArray(parsed.items) ? parsed.items : [];

      // Insert extracted lines + save barcodes
      if (items.length > 0) {
        const validItems = items.filter((i: any) => i && i.name);
        const linesPayload = validItems.map((i: any) => ({
          receipt_id: receiptId,
          item_name: String(i.name),
          normalized_name: String(i.name).toLowerCase().trim().replace(/\s+/g, " "),
          quantity: typeof i.quantity === "number" ? i.quantity : 1,
          unit_price: typeof i.unit_price === "number" ? i.unit_price : null,
          line_total: typeof i.line_total === "number" ? i.line_total : null,
        }));
        if (linesPayload.length > 0) {
          await supabase.from("receipt_lines").insert(linesPayload);
        }

        // Save barcode→name mappings for Cheapersal lookups
        const barcodeItems = validItems.filter(
          (i: any) => i.barcode && /^\d{7,13}$/.test(String(i.barcode))
        );
        for (const bi of barcodeItems) {
          try {
            await supabase.from("product_barcodes").upsert(
              {
                barcode: String(bi.barcode),
                item_name: String(bi.name),
                normalized_name: String(bi.name).toLowerCase().trim().replace(/\s+/g, " "),
                local_user_id: local_user_id,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "barcode" }
            );
          } catch {}
        }
      }

      await supabase
        .from("receipts")
        .update({
          status: "done",
          vendor_name: vendor,
          receipt_total: total,
          ocr_raw_text: text,
          ocr_json: parsed,
          processed_at: new Date().toISOString(),
        })
        .eq("id", receiptId);

      return NextResponse.json({
        receipt_id: receiptId,
        vendor_name: vendor,
        total,
        items,
      });
    } catch (procErr: any) {
      await supabase
        .from("receipts")
        .update({
          status: "failed",
          error_message: procErr.message || String(procErr),
        })
        .eq("id", receiptId);

      console.error("Gemini OCR failed:", procErr);
      return NextResponse.json(
        { error: procErr.message || "OCR failed", receipt_id: receiptId },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("Process route error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
