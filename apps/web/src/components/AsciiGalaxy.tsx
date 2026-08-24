import { useEffect, useRef } from 'react'

const W = 96
const H = 38
// Brightness gradient: darkest -> brightest
const SHADES = [' ', '.', ':', '*', 'o', 'O', '@']

interface Star {
  // polar coords in the galactic disk
  r: number
  theta: number
  // brightness 0..1
  b: number
}

function buildStars(): Star[] {
  const stars: Star[] = []
  const arms = 4
  const starsPerArm = 70

  // spiral arms (logarithmic spiral)
  for (let arm = 0; arm < arms; arm++) {
    const armOffset = (arm / arms) * Math.PI * 2
    for (let i = 0; i < starsPerArm; i++) {
      const t = i / starsPerArm // 0 (center) .. 1 (edge)
      const r = 1.5 + Math.pow(t, 1.6) * 20
      const theta = armOffset + t * 4.2 + (Math.random() - 0.5) * (0.25 + t * 0.5)
      const b = 0.45 + Math.random() * 0.5 - t * 0.25
      stars.push({ r, theta, b })
    }
  }

  // bright galactic core cluster
  for (let i = 0; i < 26; i++) {
    stars.push({
      r: Math.random() * 2.6,
      theta: Math.random() * Math.PI * 2,
      b: 0.7 + Math.random() * 0.3,
    })
  }

  // halo / background dust
  for (let i = 0; i < 70; i++) {
    stars.push({
      r: 4 + Math.random() * 18,
      theta: Math.random() * Math.PI * 2,
      b: 0.1 + Math.random() * 0.3,
    })
  }

  return stars
}

export function AsciiGalaxy() {
  const screenRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const screen = screenRef.current
    if (!screen) return

    const stars = buildStars()
    let angle = 0
    let raf = 0
    const TILT = 0.55 // viewing angle above the galactic plane

    function render() {
      const buf: string[][] = Array.from({ length: H }, () => Array(W).fill(' '))
      const glow: number[][] = Array.from({ length: H }, () => Array(W).fill(0))

      const cx = W / 2
      const cy = H / 2

      for (const star of stars) {
        // rotate the disk
        const x = star.r * Math.cos(star.theta + angle)
        const z = star.r * Math.sin(star.theta + angle)
        // tilt: bring depth into the vertical axis
        const y = -z * Math.sin(TILT) * 0.9
        const depth = z * Math.cos(TILT)

        // perspective: nearer stars spread out more
        const persp = 34 / (34 - depth * 0.55)
        const sx = Math.round(cx + x * persp)
        const sy = Math.round(cy + y * persp)
        if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue

        // brightness: base + core boost + depth fade
        const depthFade = 1 - Math.max(0, depth) / 26
        const bright = Math.min(1, star.b * (0.55 + 0.45 * depthFade))
        const level = Math.round(bright * (SHADES.length - 1))
        if (level > glow[sy][sx]) {
          glow[sy][sx] = level
          buf[sy][sx] = SHADES[level]
        }
      }

      screen!.textContent = buf.map((row) => row.join('')).join('\n')
      angle += 0.012
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Scale down to fit narrow screens; the box (background) follows the art.
  useEffect(() => {
    const screen = screenRef.current
    const wrap = wrapRef.current
    const box = boxRef.current
    if (!screen || !wrap || !box) return

    function fit() {
      const naturalW = screen!.scrollWidth
      const naturalH = screen!.scrollHeight
      const scale = Math.min(1, wrap!.clientWidth / naturalW)
      box!.style.width = `${naturalW * scale}px`
      box!.style.height = `${naturalH * scale}px`
      screen!.style.transform = `scale(${scale})`
      screen!.style.transformOrigin = 'top left'
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={wrapRef} className="ascii-galaxy-wrap">
      <div ref={boxRef} className="ascii-galaxy-box">
        <div ref={screenRef} className="ascii-galaxy" aria-hidden="true" />
      </div>
    </div>
  )
}
