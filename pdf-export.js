// js/pdf-export.js
// One shared, generic PDF report builder used by the admin dashboard
// (Results, Students) and the student dashboard (own exam history), so
// the "professional PDF" layout logic exists in exactly one place.
// Requires jsPDF + jspdf-autotable <script> tags to be loaded on the
// page (adds globals `window.jspdf.jsPDF` and `.autoTable`).

const BRAND_RGB = [79, 70, 229];
const PASS_RGB = { text: [6, 95, 70], fill: [209, 250, 229] };
const FAIL_RGB = { text: [153, 27, 27], fill: [254, 226, 226] };
const ABSENT_RGB = { text: [55, 65, 81], fill: [229, 231, 235] };

function formatCell(raw, type) {
  if (raw == null || raw === "") return "-";
  if (type === "percentage") return `${raw}%`;
  if (type === "date") return new Date(raw).toLocaleString();
  return String(raw);
}

/**
 * options:
 *  title          - main report heading
 *  subtitle       - small line under the title (defaults to app name)
 *  filtersText    - "Exam: X | Section: Y" line, omitted if empty
 *  summaryCards   - [{ label, value }, ...] shown as small stat boxes
 *  columns        - [{ key, label, type? }, ...] ("percentage" | "date" | "status")
 *  rows           - data rows (already filtered by the caller)
 *  filename       - download filename
 */
export function generateReportPDF({
  title,
  subtitle = "Coding Exam Platform",
  filtersText = "",
  summaryCards = [],
  columns,
  rows,
  filename = "report.pdf"
}) {
  if (typeof window.jspdf === "undefined") {
    alert("PDF export library did not load. Check your internet connection and try again.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;

  // Header band
  doc.setFillColor(...BRAND_RGB);
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 30);
  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  doc.text(subtitle, margin, 46);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 30, { align: "right" });

  let y = 84;
  if (filtersText) {
    doc.setTextColor(90, 90, 90);
    doc.setFontSize(9);
    doc.text(`Filters: ${filtersText}`, margin, y);
    y += 18;
  }

  // Summary stat boxes
  if (summaryCards.length) {
    const gap = 10;
    const cardWidth = (pageWidth - margin * 2 - gap * (summaryCards.length - 1)) / summaryCards.length;
    summaryCards.forEach((c, i) => {
      const x = margin + i * (cardWidth + gap);
      doc.setFillColor(245, 246, 250);
      doc.roundedRect(x, y, cardWidth, 46, 5, 5, "F");
      doc.setTextColor(...BRAND_RGB);
      doc.setFont(undefined, "bold");
      doc.setFontSize(13);
      doc.text(String(c.value), x + 10, y + 20);
      doc.setTextColor(110, 110, 110);
      doc.setFont(undefined, "normal");
      doc.setFontSize(8);
      doc.text(c.label, x + 10, y + 34);
    });
    y += 62;
  }

  doc.autoTable({
    startY: y,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => formatCell(r[c.key], c.type))),
    margin: { left: margin, right: margin, bottom: 36 },
    styles: { fontSize: 8, cellPadding: 6, textColor: [40, 40, 40] },
    headStyles: { fillColor: BRAND_RGB, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const col = columns[data.column.index];
      if (col?.type !== "status") return;
      if (data.cell.raw === "PASS") {
        data.cell.styles.textColor = PASS_RGB.text;
        data.cell.styles.fillColor = PASS_RGB.fill;
        data.cell.styles.fontStyle = "bold";
      } else if (data.cell.raw === "FAIL") {
        data.cell.styles.textColor = FAIL_RGB.text;
        data.cell.styles.fillColor = FAIL_RGB.fill;
        data.cell.styles.fontStyle = "bold";
      } else if (data.cell.raw === "ABSENT") {
        data.cell.styles.textColor = ABSENT_RGB.text;
        data.cell.styles.fillColor = ABSENT_RGB.fill;
        data.cell.styles.fontStyle = "bold";
      }
    }
  });

  // Footer: page numbers, drawn once all pages exist
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text("Coding Exam Platform", margin, pageHeight - 14);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 14, { align: "right" });
  }

  doc.save(filename);
}
