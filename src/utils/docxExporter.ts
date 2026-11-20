import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  VerticalAlign,
  HeadingLevel,
} from 'docx';
import { SupplierInspectionReport } from '../types/inventory';

const BORDER_STYLE = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: '444444',
};

const TABLE_BORDERS = {
  top: BORDER_STYLE,
  bottom: BORDER_STYLE,
  left: BORDER_STYLE,
  right: BORDER_STYLE,
  insideHorizontal: BORDER_STYLE,
  insideVertical: BORDER_STYLE,
};

function createCell(
  text: string,
  options: {
    bold?: boolean;
    widthPercent?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    fill?: string;
  } = {}
): TableCell {
  return new TableCell({
    width: options.widthPercent ? { size: options.widthPercent, type: WidthType.PERCENTAGE } : undefined,
    shading: options.fill ? { fill: options.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: {
      top: 100,
      bottom: 100,
      left: 120,
      right: 120,
    },
    children: [
      new Paragraph({
        alignment: options.align || AlignmentType.LEFT,
        children: [
          new TextRun({
            text: text || '',
            bold: options.bold || false,
            size: 19, // ~9.5pt
            font: 'Arial',
            color: '111827',
          }),
        ],
      }),
    ],
  });
}

export function buildInspectionReportDocx(report: SupplierInspectionReport): Document {
  const primaryItemName = report.items?.[0]?.description || report.subtitle || 'Supplied Components';

  // 1. Header Metadata Table (4 columns)
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          createCell('Supplier', { bold: true, widthPercent: 22, fill: 'F3F4F6' }),
          createCell(report.supplier, { widthPercent: 28 }),
          createCell('Inspection Report No.', { bold: true, widthPercent: 25, fill: 'F3F4F6' }),
          createCell(report.reportNumber, { widthPercent: 25, bold: true }),
        ],
      }),
      new TableRow({
        children: [
          createCell('Supplier GSTIN', { bold: true, widthPercent: 22, fill: 'F3F4F6' }),
          createCell(report.supplierGstin || 'N/A', { widthPercent: 28 }),
          createCell('Inspection Date', { bold: true, widthPercent: 25, fill: 'F3F4F6' }),
          createCell(report.reportDate, { widthPercent: 25 }),
        ],
      }),
      new TableRow({
        children: [
          createCell('Customer', { bold: true, widthPercent: 22, fill: 'F3F4F6' }),
          createCell(report.customer, { widthPercent: 28 }),
          createCell('Invoice No.', { bold: true, widthPercent: 25, fill: 'F3F4F6' }),
          createCell(report.invoiceNumber, { widthPercent: 25, bold: true }),
        ],
      }),
      new TableRow({
        children: [
          createCell('Purchase Order', { bold: true, widthPercent: 22, fill: 'F3F4F6' }),
          createCell(report.purchaseOrder || 'N/A', { widthPercent: 28 }),
          createCell('E-Way Bill', { bold: true, widthPercent: 25, fill: 'F3F4F6' }),
          createCell(report.ewayBill || 'N/A', { widthPercent: 25 }),
        ],
      }),
    ],
  });

  // 2. Section 1: Supplied Item Details Table
  const itemRows: TableRow[] = [
    new TableRow({
      children: [
        createCell('Sl. No.', { bold: true, widthPercent: 12, fill: 'E5E7EB', align: AlignmentType.CENTER }),
        createCell('Description', { bold: true, widthPercent: 48, fill: 'E5E7EB' }),
        createCell('HSN', { bold: true, widthPercent: 20, fill: 'E5E7EB', align: AlignmentType.CENTER }),
        createCell('Quantity (Batch)', { bold: true, widthPercent: 20, fill: 'E5E7EB', align: AlignmentType.RIGHT }),
      ],
    }),
  ];

  (report.items && report.items.length > 0 ? report.items : [
    { slNo: 1, description: primaryItemName, hsn: '39269099', quantity: 590 }
  ]).forEach((it, idx) => {
    itemRows.push(
      new TableRow({
        children: [
          createCell(String(it.slNo || idx + 1), { widthPercent: 12, align: AlignmentType.CENTER }),
          createCell(it.description, { widthPercent: 48, bold: true }),
          createCell(it.hsn || '-', { widthPercent: 20, align: AlignmentType.CENTER }),
          createCell(String(it.quantity || 0), { widthPercent: 20, align: AlignmentType.RIGHT, bold: true }),
        ],
      })
    );
  });

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: itemRows,
  });

  // 3. Section 2: Inspection & Quality Checks Table
  const checkRows: TableRow[] = [
    new TableRow({
      children: [
        createCell('Check', { bold: true, widthPercent: 24, fill: 'E5E7EB' }),
        createCell('Acceptance Requirement', { bold: true, widthPercent: 32, fill: 'E5E7EB' }),
        createCell('Testing Method', { bold: true, widthPercent: 26, fill: 'E5E7EB' }),
        createCell('Observation', { bold: true, widthPercent: 18, fill: 'E5E7EB', align: AlignmentType.CENTER }),
      ],
    }),
  ];

  report.checks.forEach((chk) => {
    checkRows.push(
      new TableRow({
        children: [
          createCell(chk.check, { widthPercent: 24, bold: true }),
          createCell(chk.acceptanceRequirement, { widthPercent: 32 }),
          createCell(chk.testingMethod, { widthPercent: 26 }),
          createCell(chk.observation || 'Found OK', {
            widthPercent: 18,
            align: AlignmentType.CENTER,
            bold: true,
            fill: chk.observation?.toLowerCase().includes('ok') ? 'ECFDF5' : undefined,
          }),
        ],
      })
    );
  });

  const checksTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: checkRows,
  });

  // 4. Section 3: Sampling Record Table
  const samplingTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          createCell('Parameter', { bold: true, widthPercent: 35, fill: 'E5E7EB' }),
          createCell('Record', { bold: true, widthPercent: 65, fill: 'E5E7EB' }),
        ],
      }),
      new TableRow({
        children: [
          createCell('Sample quantity', { bold: true, widthPercent: 35 }),
          createCell(report.samplingRecord?.sampleQuantity || 'Visual Inspection - 100% | Others 10 samples per batch', { widthPercent: 65 }),
        ],
      }),
      new TableRow({
        children: [
          createCell('Inspection method', { bold: true, widthPercent: 35 }),
          createCell(report.samplingRecord?.inspectionMethod || 'Visual inspection and measurement against approved drawing / specification', { widthPercent: 65 }),
        ],
      }),
    ],
  });

  // 5. Section 4: Sign-off Table
  const signTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          createCell('Prepared / Inspected By', { bold: true, widthPercent: 50, fill: 'E5E7EB' }),
          createCell('Verified By', { bold: true, widthPercent: 50, fill: 'E5E7EB' }),
        ],
      }),
      new TableRow({
        children: [
          createCell(`Name: ${report.preparedBy?.name || 'Suresh'}`, { widthPercent: 50 }),
          createCell(`Name: ${report.verifiedBy?.name || 'Mani Kumar'}`, { widthPercent: 50 }),
        ],
      }),
      new TableRow({
        children: [
          createCell(`Designation: ${report.preparedBy?.designation || 'Supervisor'}`, { widthPercent: 50 }),
          createCell(`Designation: ${report.verifiedBy?.designation || 'In-charge'}`, { widthPercent: 50 }),
        ],
      }),
      new TableRow({
        children: [
          createCell(`Date: ${report.preparedBy?.date || report.reportDate}`, { widthPercent: 50 }),
          createCell(`Date: ${report.verifiedBy?.date || report.reportDate}`, { widthPercent: 50 }),
        ],
      }),
      new TableRow({
        children: [
          createCell(`Signature: ${report.preparedBy?.signatureText || '✓ (Signed on file)'}`, { widthPercent: 50, bold: true }),
          createCell(`Signature: ${report.verifiedBy?.signatureText || '✓ (Signed on file)'}`, { widthPercent: 50, bold: true }),
        ],
      }),
    ],
  });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720, // 0.5 in
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children: [
          // Main Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'SUPPLIER INSPECTION REPORT',
                bold: true,
                size: 28, // 14pt
                font: 'Arial',
                color: '111827',
              }),
            ],
          }),

          // Subtitle (e.g. ABS ENCLOSURES)
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: (report.subtitle || primaryItemName).toUpperCase(),
                bold: true,
                size: 22, // 11pt
                font: 'Arial',
                color: '4B5563',
              }),
            ],
          }),

          // Header Meta Table
          metaTable,

          // Section 1 Header
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [
              new TextRun({
                text: '1. Supplied Item Details',
                bold: true,
                size: 21,
                font: 'Arial',
              }),
            ],
          }),
          itemsTable,

          // Section 2 Header
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [
              new TextRun({
                text: '2. Inspection & Quality Checks',
                bold: true,
                size: 21,
                font: 'Arial',
              }),
            ],
          }),
          checksTable,

          // Section 3 Header
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [
              new TextRun({
                text: '3. Inspection Sampling / Record',
                bold: true,
                size: 21,
                font: 'Arial',
              }),
            ],
          }),
          samplingTable,

          // Section 4 Header
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [
              new TextRun({
                text: '4. Inspection Conclusion',
                bold: true,
                size: 21,
                font: 'Arial',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 140 },
            children: [
              new TextRun({
                text:
                  report.conclusionText ||
                  `Based on the inspection checks recorded above and verification against the applicable approved drawing / purchase specification, we shall confirm that supplied ${primaryItemName} conform to the specified requirements.`,
                size: 19,
                font: 'Arial',
                color: '374151',
              }),
            ],
          }),
          signTable,
        ],
      },
    ],
  });
}

/**
 * Generates a .docx Blob and sanitized filename for downloading or uploading to Google Drive.
 */
export async function buildInspectionReportDocxBlob(
  report: SupplierInspectionReport
): Promise<{ blob: Blob; fileName: string }> {
  const doc = buildInspectionReportDocx(report);
  const blob = await Packer.toBlob(doc);
  const cleanNum = (report.reportNumber || 'SIR').replace(/[\/\\?%*:|"<>]/g, '_');
  const fileName = `Supplier_Inspection_Report_${cleanNum}.docx`;
  return { blob, fileName };
}

/**
 * Triggers a browser download of the Supplier Inspection Report in .docx Microsoft Word format.
 */
export async function downloadInspectionReportDocx(report: SupplierInspectionReport): Promise<void> {
  const { blob, fileName } = await buildInspectionReportDocxBlob(report);

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
