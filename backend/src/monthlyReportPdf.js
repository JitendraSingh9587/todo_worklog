const PDFDocument = require("pdfkit");

const TYPE_LABELS = {
  working: "Working day",
  weekend: "Weekend",
  holiday: "Public holiday",
  leave: "Leave",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * @param {number} year
 * @param {number} month 1–12
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * @param {object} doc PDFKit document
 * @param {number} needed
 */
function ensureSpace(doc, needed = 72) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

/**
 * @param {{
 *   year: number,
 *   month: number,
 *   rows: Array<{ day: object, dayType: string, text: string }>,
 *   counts: { working: number, weekend: number, holiday: number, leave: number },
 * }} payload
 * @returns {Promise<Buffer>}
 */
function buildMonthlyReportPdf(payload) {
  const { year, month, rows, counts } = payload;
  const monthName = MONTH_NAMES[month - 1] || String(month);
  const totalOffDays = counts.weekend + counts.holiday + counts.leave;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `TimeSheet ${monthName} ${year}`,
        Author: "TimeSheet",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(`Monthly Work Report — ${monthName} ${year}`, { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#444444")
      .text(`Generated ${new Date().toLocaleString()}`, { align: "center" });
    doc.fillColor("#000000");
    doc.moveDown(1.2);

    doc.fontSize(11).font("Helvetica");
    doc.text(
      `${monthName} ${year}: ${rows.length} days — ${counts.working} working, ${counts.weekend} weekend, ${counts.holiday} holiday, ${counts.leave} leave.`,
    );
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").text(`Working days: ${counts.working}`);
    doc.font("Helvetica-Bold").text(`Total holidays (off days): ${totalOffDays}`);
    doc.font("Helvetica");
    doc.moveDown(1);

    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#cccccc")
      .stroke();
    doc.strokeColor("#000000");
    doc.moveDown(0.8);

    for (const { day, dayType, text } of rows) {
      ensureSpace(doc, 90);
      const title = `${day.weekday}, ${day.monthName} ${day.day}, ${year}`;
      const badge = TYPE_LABELS[dayType] || dayType;

      doc.fontSize(11).font("Helvetica-Bold").text(`${title}  —  ${badge}`);
      doc.font("Helvetica");

      if (text) {
        doc.moveDown(0.25);
        const bullets = text.split("\n").filter((line) => line.trim());
        doc.fontSize(9);
        for (const line of bullets) {
          ensureSpace(doc, 16);
          doc.text(`• ${line.trim()}`, { indent: 12, lineGap: 2 });
        }
        doc.fontSize(11);
      } else if (dayType === "working") {
        doc.moveDown(0.2);
        doc.fontSize(9).fillColor("#666666").text("No daily update.");
        doc.fillColor("#000000").fontSize(11);
      }

      doc.moveDown(0.65);
    }

    doc.end();
  });
}

module.exports = {
  MONTH_NAMES,
  daysInMonth,
  buildMonthlyReportPdf,
  TYPE_LABELS,
};
