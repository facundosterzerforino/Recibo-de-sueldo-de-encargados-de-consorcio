function slugFileName(raw: string): string {
  const s = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\d-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return s || 'recibo-sueldo'
}

/**
 * Genera un PDF a partir de un nodo HTML (típicamente el recibo).
 * Carga jspdf y html2canvas solo al exportar.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  fileBaseName: string,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const canvas = await html2canvas(element, {
    scale: 2,
    logging: false,
    useCORS: true,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10
  const maxW = pageW - 2 * margin
  const maxH = pageH - 2 * margin

  let drawW = maxW
  let drawH = (canvas.height * drawW) / canvas.width
  if (drawH > maxH) {
    drawH = maxH
    drawW = (canvas.width * drawH) / canvas.height
  }

  const x = margin + (maxW - drawW) / 2
  const y = margin + (maxH - drawH) / 2

  pdf.addImage(imgData, 'PNG', x, y, drawW, drawH)
  pdf.save(`${slugFileName(fileBaseName)}.pdf`)
}
