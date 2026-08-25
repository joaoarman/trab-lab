import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Exporta um título + uma tabela (cabeçalhos + linhas) para um .pdf e baixa.
// Ex.: exportTableToPdf('APRs', ['Título','Status'], [['APR 1','Concluída']], 'aprs.pdf')
export function exportTableToPdf(
  title: string,
  head: string[],
  body: (string | number)[][],
  filename = 'export.pdf',
): void {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(title, 14, 18)
  autoTable(doc, {
    head: [head],
    body,
    startY: 24,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [27, 60, 140] }, // navy-700 da marca
  })
  doc.save(filename)
}
