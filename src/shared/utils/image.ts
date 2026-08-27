export function fileToScaledDataUrl(
  file: File,
  maxSize = 1100,
  quality = 0.72,
  mime: 'image/jpeg' | 'image/png' = 'image/jpeg',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          const r = Math.min(maxSize / width, maxSize / height)
          width = Math.round(width * r)
          height = Math.round(height * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas 2D context indisponível')); return }
        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL(mime, quality))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export interface AreaDeRecorte {
  x: number
  y: number
  width: number
  height: number
}

export function cropToSquareJpeg(
  src: string,
  area: AreaDeRecorte,
  lado = 512,
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = lado
      canvas.height = lado
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D context indisponível'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, lado, lado)
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, lado, lado)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar o JPEG'))),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => reject(new Error('Falha ao carregar a imagem'))
    img.src = src
  })
}
