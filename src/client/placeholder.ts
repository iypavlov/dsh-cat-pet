/**
 * Canvas-заглушка: котик без арта.
 *
 * Рисуется один раз при монтировании — никаких таймеров и rAF.
 * Нужна, чтобы плагин был «живой» до появления спрайт-атласа
 * и деградация при битом атласе была видимой, а не пустой.
 */

/** Сторона кота в CSS px. */
const CAT_SIZE = 96

export function drawPlaceholder(canvas: HTMLCanvasElement, size: number = CAT_SIZE): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.max(1, Math.round(size * dpr))
  canvas.height = Math.max(1, Math.round(size * dpr))
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`

  const g = canvas.getContext('2d')
  if (!g) return
  g.scale(dpr, dpr)

  const cx = size / 2
  const s = size / 96 // масштаб от базового 96px
  const body = '#e8a24a'
  const ink = '#2b1d12'

  g.fillStyle = body

  // Уши
  g.beginPath()
  g.moveTo(cx - 32 * s, 34 * s)
  g.lineTo(cx - 24 * s, 8 * s)
  g.lineTo(cx - 8 * s, 26 * s)
  g.closePath()
  g.fill()
  g.beginPath()
  g.moveTo(cx + 32 * s, 34 * s)
  g.lineTo(cx + 24 * s, 8 * s)
  g.lineTo(cx + 8 * s, 26 * s)
  g.closePath()
  g.fill()

  // Голова
  g.beginPath()
  g.ellipse(cx, 52 * s, 34 * s, 30 * s, 0, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 2 * s
  g.strokeStyle = ink
  g.stroke()

  // Глаза
  g.fillStyle = ink
  g.beginPath()
  g.ellipse(cx - 13 * s, 50 * s, 3 * s, 5 * s, 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.ellipse(cx + 13 * s, 50 * s, 3 * s, 5 * s, 0, 0, Math.PI * 2)
  g.fill()

  // Нос
  g.fillStyle = '#d76a5a'
  g.beginPath()
  g.moveTo(cx - 4 * s, 60 * s)
  g.lineTo(cx + 4 * s, 60 * s)
  g.lineTo(cx, 65 * s)
  g.closePath()
  g.fill()

  // Усы
  g.strokeStyle = ink
  g.lineWidth = Math.max(1, s)
  for (const side of [-1, 1]) {
    for (const dy of [-3, 2]) {
      g.beginPath()
      g.moveTo(cx + side * 8 * s, (63 + dy) * s)
      g.lineTo(cx + side * 34 * s, (60 + dy * 2) * s)
      g.stroke()
    }
  }
}
