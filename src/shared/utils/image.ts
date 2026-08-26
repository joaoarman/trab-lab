// Redimensiona uma imagem no navegador e retorna um data URL (base64).
// Útil para anexos/logos antes de enviar ao Supabase Storage.
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

/** A área recortada, em pixels da imagem ORIGINAL. É o que o react-easy-crop entrega. */
export interface AreaDeRecorte {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Recorta um pedaço de uma imagem e devolve um JPEG quadrado, pronto para subir
 * como foto de perfil.
 *
 * Por que sempre reamostrar para `lado` (512px) em vez de guardar o recorte no
 * tamanho original: a foto que sai da câmera de um celular tem vários megabytes
 * e o bucket recusa acima de 2 MB. Fixar o lado dá um arquivo de dezenas de KB,
 * previsível, e o avatar nunca é exibido maior que 40px de qualquer forma.
 *
 * O fundo é pintado de branco antes do desenho porque JPEG não tem transparência:
 * sem isso, um PNG com fundo transparente sairia com o alfa virando preto.
 */
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
