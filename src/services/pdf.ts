import { jsPDF } from "jspdf";

export interface Chapter {
  title: string;
  content: string;
  image?: string;
  chart?: {
    type: string;
    data: { label: string, value: number }[];
    title: string;
  };
}

export interface PDFOptions {
  primaryColor: string;
  font: "helvetica" | "times" | "courier";
  headerText?: string;
  footerText?: string;
  logo?: string;
  watermark?: string;
  quality: "standard" | "high" | "ultra";
  noCompression: boolean;
}

export function estimatePageCount(chapters: Chapter[], options: PDFOptions): number {
  // Rough estimation: Title page (1) + TOC (1) + Chapters
  let totalPages = 2;
  const margin = 20;
  const pageWidth = 210; // A4 width in mm
  const maxLineWidth = pageWidth - margin * 2;
  const lineHeight = 7;
  const pageHeight = 297; // A4 height in mm
  const contentHeightPerPage = pageHeight - margin * 2 - 20; // Reserved for header/footer

  chapters.forEach(chapter => {
    let currentY = 0;
    // Chapter Title
    currentY += 20;
    
    // Image
    if (chapter.image) {
      currentY += (maxLineWidth * 9) / 16 + 10;
    }

    // Content
    const paragraphs = chapter.content.split('\n\n');
    paragraphs.forEach(p => {
      const lines = Math.ceil((p.length * 0.25) / maxLineWidth); // Rough line count
      currentY += lines * lineHeight + 5;
    });

    totalPages += Math.ceil(currentY / contentHeightPerPage);
    
    if (chapter.chart) {
      totalPages += 1;
    }
  });

  return totalPages;
}

export async function createPDF(title: string, chapters: Chapter[], options: PDFOptions = { primaryColor: "#4f46e5", font: "helvetica", quality: "high", noCompression: true }) {
  const doc = new jsPDF({
    compress: !options.noCompression,
    precision: options.quality === "ultra" ? 16 : 2
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxLineWidth = pageWidth - margin * 2;
  const lineHeight = 7;

  const addText = (text: string, fontSize: number, isBold: boolean, align: "left" | "center" = "left", startY: number, color?: string) => {
    doc.setFontSize(fontSize);
    doc.setFont(options.font, isBold ? "bold" : "normal");
    if (color) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      doc.setTextColor(r, g, b);
    } else {
      doc.setTextColor(0, 0, 0);
    }

    const lines = doc.splitTextToSize(text, maxLineWidth);
    let currentY = startY;

    for (const line of lines) {
      if (currentY + lineHeight > pageHeight - margin - 10) {
        doc.addPage();
        addHeaderFooter();
        currentY = margin + 15;
      }
      doc.text(line, align === "center" ? pageWidth / 2 : margin, currentY, { align });
      currentY += lineHeight;
    }
    return currentY;
  };

  const addHeaderFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    if (options.headerText) {
      doc.text(options.headerText, pageWidth / 2, 10, { align: "center" });
    }
    if (options.footerText) {
      doc.text(options.footerText, pageWidth / 2, pageHeight - 5, { align: "center" });
    }
    if (options.watermark) {
      doc.saveGraphicsState();
      doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
      doc.setFontSize(60);
      doc.text(options.watermark, pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
      doc.restoreGraphicsState();
    }
  };

  // Title Page
  if (options.logo) {
    try {
      doc.addImage(options.logo, "PNG", pageWidth / 2 - 15, 20, 30, 30);
    } catch (e) {}
  }

  doc.setFontSize(32);
  doc.setFont(options.font, "bold");
  const r = parseInt(options.primaryColor.slice(1, 3), 16);
  const g = parseInt(options.primaryColor.slice(3, 5), 16);
  const b = parseInt(options.primaryColor.slice(5, 7), 16);
  doc.setTextColor(r, g, b);

  const titleLines = doc.splitTextToSize(title, maxLineWidth);
  const titleY = pageHeight / 2 - (titleLines.length * 10) / 2;
  doc.text(titleLines, pageWidth / 2, titleY, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text("Généré par EbookAI SaaS Premium", pageWidth / 2, pageHeight - 30, { align: "center" });

  // Table of Contents
  doc.addPage();
  addHeaderFooter();
  let currentY = margin + 15;
  currentY = addText("Table des matières", 24, true, "left", currentY, options.primaryColor);
  currentY += 10;

  chapters.forEach((chapter, index) => {
    currentY = addText(`${index + 1}. ${chapter.title}`, 12, false, "left", currentY);
    currentY += 2;
  });

  // Chapters
  for (let i = 0; i < chapters.length; i++) {
    doc.addPage();
    addHeaderFooter();
    const chapter = chapters[i];
    currentY = margin + 15;

    // Chapter Title
    currentY = addText(`Chapitre ${i + 1}: ${chapter.title}`, 22, true, "left", currentY, options.primaryColor);
    currentY += 10;

    // Chapter Image
    if (chapter.image) {
      try {
        const imgWidth = maxLineWidth;
        const imgHeight = (imgWidth * 9) / 16;
        if (currentY + imgHeight > pageHeight - margin - 10) {
          doc.addPage();
          addHeaderFooter();
          currentY = margin + 15;
        }
        // Use high quality image adding
        doc.addImage(chapter.image, "JPEG", margin, currentY, imgWidth, imgHeight, undefined, options.noCompression ? 'NONE' : 'FAST');
        currentY += imgHeight + 10;
      } catch (e) {}
    }

    // Chapter Content
    const paragraphs = chapter.content.split('\n\n');
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === "") continue;
      currentY = addText(paragraph.trim(), 11, false, "left", currentY);
      currentY += 5;
    }

    if (chapter.chart) {
      if (currentY + 60 > pageHeight - margin) {
        doc.addPage();
        addHeaderFooter();
        currentY = margin + 15;
      }
      currentY = addText(`Graphique: ${chapter.chart.title}`, 16, true, "left", currentY, options.primaryColor);
      currentY += 10;
      chapter.chart.data.forEach(item => {
        currentY = addText(`${item.label}: ${item.value}`, 10, false, "left", currentY);
      });
    }
  }

  // Page Numbers
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} sur ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
  }

  return doc.output('blob');
}


