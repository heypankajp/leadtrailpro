import PDFDocument from "pdfkit";

/**
 * Server-side PDF tables (RPT-06, TRIP-11): a title block, optional key/value lines, and a paginated table that
 * repeats its header on every page and numbers the pages. Built on pdfkit with its built-in Helvetica fonts.
 */

export type PdfColumn = { header: string; width: number; align?: "left" | "right" | "center" };
export type PdfTable = {
  title: string;
  subtitle?: string;
  meta?: [string, string][];
  columns: PdfColumn[];
  rows: (string | number | null | undefined)[][];
  landscape?: boolean;
  emptyText?: string;
};

export async function renderTablePdf(table: PdfTable): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: table.landscape ? "landscape" : "portrait", margin: 36, bufferPages: true, info: { Title: table.title, Author: "LeadTrailPro" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 18;
  const scale = pageWidth / table.columns.reduce((sum, column) => sum + column.width, 0);
  const widths = table.columns.map((column) => column.width * scale);
  const cellPadding = 4;
  const fontSize = 8;

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111").text(table.title, left, doc.y);
  if (table.subtitle) doc.font("Helvetica").fontSize(10).fillColor("#555").text(table.subtitle, left, doc.y + 2);
  for (const [label, value] of table.meta ?? []) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#333").text(`${label}: `, left, doc.y + 2, { continued: true });
    doc.font("Helvetica").text(value);
  }
  doc.moveDown(0.8);

  let y = doc.y;
  const drawHeader = () => {
    doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#111");
    let x = left;
    table.columns.forEach((column, index) => {
      doc.text(column.header.toUpperCase(), x + cellPadding, y + 3, { width: widths[index] - cellPadding * 2, align: column.align ?? "left", lineBreak: false });
      x += widths[index];
    });
    y += 16;
    doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.8).strokeColor("#333").stroke();
    y += 3;
  };
  drawHeader();

  doc.font("Helvetica").fontSize(fontSize).fillColor("#111");
  if (!table.rows.length) doc.text(table.emptyText ?? "Nothing to report.", left + cellPadding, y + 4);
  for (const row of table.rows) {
    const cells = table.columns.map((_, index) => (row[index] === null || row[index] === undefined ? "" : String(row[index])));
    const height = Math.max(fontSize + 4, ...cells.map((cell, index) => doc.heightOfString(cell, { width: widths[index] - cellPadding * 2 }))) + cellPadding * 2;
    if (y + height > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
      doc.font("Helvetica").fontSize(fontSize).fillColor("#111");
    }
    let x = left;
    cells.forEach((cell, index) => {
      doc.text(cell, x + cellPadding, y + cellPadding, { width: widths[index] - cellPadding * 2, align: table.columns[index].align ?? "left" });
      x += widths[index];
    });
    y += height;
    doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.3).strokeColor("#ccc").stroke();
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Writing below the bottom margin would make pdfkit start a new page; lift the margin while the footer is drawn.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7.5).fillColor("#777").text(`LeadTrailPro · ${table.title} · page ${index - range.start + 1} of ${range.count}`, left, doc.page.height - savedBottom + 2, { width: pageWidth, align: "right", lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
  doc.end();
  return finished;
}

export const pdfResponse = (buffer: Buffer, fileName: string) => new Response(new Uint8Array(buffer), {
  headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" },
});
