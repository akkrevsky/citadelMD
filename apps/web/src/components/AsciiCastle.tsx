import { useEffect, useRef } from 'react'

const W = 100
const H = 40

interface Tower {
  x: number
  z: number
  r: number
  h: number
  type: 'main' | 'tower' | 'small' | 'tiny'
}

// Irregular fortress layout (asymmetric towers + walls between close pairs).
const TOWERS: Tower[] = [
  { x: 0, z: 0, r: 6, h: 24, type: 'main' },
  { x: -15, z: -5, r: 4, h: 18, type: 'tower' },
  { x: 12, z: -8, r: 5, h: 20, type: 'tower' },
  { x: -10, z: 10, r: 3, h: 15, type: 'tower' },
  { x: 18, z: 7, r: 4, h: 17, type: 'tower' },
  { x: -25, z: -15, r: 3, h: 14, type: 'small' },
  { x: -28, z: 5, r: 4, h: 16, type: 'small' },
  { x: -20, z: 18, r: 3, h: 13, type: 'small' },
  { x: 25, z: -18, r: 5, h: 19, type: 'small' },
  { x: 30, z: 0, r: 3, h: 15, type: 'small' },
  { x: 22, z: 20, r: 4, h: 16, type: 'small' },
  { x: -35, z: -8, r: 3, h: 12, type: 'tiny' },
  { x: 38, z: -10, r: 4, h: 14, type: 'tiny' },
  { x: -32, z: 15, r: 3, h: 11, type: 'tiny' },
  { x: 35, z: 12, r: 3, h: 13, type: 'tiny' },
  { x: -8, z: -18, r: 2, h: 10, type: 'tiny' },
  { x: 10, z: 16, r: 2, h: 9, type: 'tiny' },
]

const WALLS: Array<{ from: number; to: number; h: number }> = []
for (let i = 0; i < TOWERS.length; i++) {
  for (let j = i + 1; j < TOWERS.length; j++) {
    const dx = TOWERS[i].x - TOWERS[j].x
    const dz = TOWERS[i].z - TOWERS[j].z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 25 && dist > 8) {
      WALLS.push({ from: i, to: j, h: Math.min(TOWERS[i].h, TOWERS[j].h) - 2 })
    }
  }
}

export function AsciiCastle() {
  const screenRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Scale the fixed-size frame down to fit narrow screens (mobile).
  // The black box resizes with the art so the background follows it.
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

  useEffect(() => {
    const screen = screenRef.current
    if (!screen) return

    let angle = 0
    let raf = 0

    function render() {
      const buf: string[][] = Array.from({ length: H }, () => Array(W).fill(' '))
      const zBuf: number[][] = Array.from({ length: H }, () => Array(W).fill(-Infinity))

      const cx = W / 2
      const baseY = H - 4
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)

      function setChar(x: number, y: number, ch: string, z: number) {
        const fx = Math.floor(x)
        const fy = Math.floor(y)
        if (fx >= 0 && fx < W && fy >= 0 && fy < H && z > zBuf[fy][fx]) {
          buf[fy][fx] = ch
          zBuf[fy][fx] = z
        }
      }

      // grass
      const grassChars = ['^', 'v', '*', '#', '@', '.', ',', ';']
      for (let x = 0; x < W; x++) {
        buf[baseY + 1][x] = grassChars[(x * 7 + 3) % grassChars.length]
        buf[baseY + 2][x] = grassChars[(x * 13 + 5) % grassChars.length]
        buf[baseY + 3][x] = grassChars[(x * 19 + 7) % grassChars.length]
      }

      function drawTower(tower: Tower) {
        const { x: tx, z: tz, r, h, type } = tower
        const rotCX = tx * cosA - tz * sinA
        const rotCZ = tx * sinA + tz * cosA

        for (let y = 0; y < h; y++) {
          const screenY = baseY - y
          for (let i = -r; i <= r; i += 0.4) {
            if (Math.abs(i) > r) continue
            const localZ = Math.sqrt(Math.max(0, r * r - i * i))
            for (let side = -1; side <= 1; side += 2) {
              const worldX = rotCX + i
              const worldZ = rotCZ + side * localZ
              if (worldZ < 0) continue
              const screenX = cx + worldX

              let ch = ':'
              const pattern = (y * 3 + Math.floor(i * 2)) % 5
              if (type === 'main') {
                if (pattern === 0) ch = '@'
                else if (pattern === 1) ch = '#'
                else if (pattern === 2) ch = '+'
              } else if (type === 'tower') {
                if (pattern === 0) ch = '#'
                else if (pattern === 1) ch = '+'
              } else if (pattern === 0) {
                ch = '#'
              }

              const light = localZ / r
              if (light < 0.2) ch = '.'
              else if (light > 0.85 && ch === '#') ch = '@'

              setChar(screenX, screenY, ch, worldZ)
            }
          }
        }

        // merlons
        const topY = baseY - h
        const merlons = type === 'main' ? 10 : type === 'tower' ? 7 : 5
        for (let i = 0; i < merlons; i++) {
          const theta = (i / merlons) * Math.PI * 2
          const lx = r * Math.cos(theta)
          const lz = r * Math.sin(theta)
          const worldX = rotCX + lx
          const worldZ = rotCZ + lz
          if (worldZ < 0) continue
          const screenX = cx + worldX
          const merlonChar = type === 'main' ? '@' : '#'
          setChar(screenX, topY, merlonChar, worldZ)
          setChar(screenX + 1, topY, merlonChar, worldZ)
          if (type === 'main' || type === 'tower') {
            setChar(screenX, topY - 1, merlonChar, worldZ)
            setChar(screenX + 1, topY - 1, merlonChar, worldZ)
          }
        }

        // windows on big towers
        if (type === 'main' || type === 'tower') {
          const winY = baseY - h + Math.floor(h / 3)
          const windows = type === 'main' ? 3 : 2
          for (let w = 0; w < windows; w++) {
            const theta = (w / windows) * Math.PI * 1.5 - Math.PI / 3
            const lx = r * Math.cos(theta)
            const lz = r * Math.sin(theta)
            const worldX = rotCX + lx
            const worldZ = rotCZ + lz
            if (worldZ < 1) continue
            const screenX = cx + worldX
            setChar(screenX - 1, winY, '[', worldZ)
            setChar(screenX, winY, ']', worldZ)
            setChar(screenX - 1, winY + 1, '[', worldZ)
            setChar(screenX, winY + 1, ']', worldZ)
          }
        }

        // door on the main tower
        if (type === 'main') {
          const doorLZ = r * Math.sin(0)
          const doorWorldZ = rotCZ + doorLZ
          if (doorWorldZ > 0) {
            const doorX = cx + rotCX + r * Math.cos(0)
            const doorBase = baseY
            for (const [dx, dy, ch] of [
              [-2, -4, '/'], [2, -4, '\\'], [-2, -3, '|'], [2, -3, '|'],
              [-2, -2, '|'], [2, -2, '|'], [-2, -1, '|'], [2, -1, '|'],
            ] as Array<[number, number, string]>) {
              setChar(doorX + dx, doorBase + dy, ch, doorWorldZ)
            }
            for (let dy = -4; dy <= -1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                setChar(doorX + dx, doorBase + dy, '░', doorWorldZ)
              }
            }
            setChar(doorX - 1, doorBase, '/', doorWorldZ)
            setChar(doorX, doorBase, '\\', doorWorldZ)
            setChar(doorX + 1, doorBase, '_', doorWorldZ)
          }
        }
      }

      function drawWall(wall: { from: number; to: number; h: number }) {
        const t1 = TOWERS[wall.from]
        const t2 = TOWERS[wall.to]
        const x1 = t1.x * cosA - t1.z * sinA
        const z1 = t1.x * sinA + t1.z * cosA
        const x2 = t2.x * cosA - t2.z * sinA
        const z2 = t2.x * sinA + t2.z * cosA

        const steps = 40
        for (let s = 0; s <= steps; s++) {
          const t = s / steps
          const wx = x1 + (x2 - x1) * t
          const wz = z1 + (z2 - z1) * t
          if (wz < 0) continue
          const screenX = cx + wx

          for (let y = 0; y < wall.h; y++) {
            const screenY = baseY - y
            let ch = ':'
            if (y % 2 === 0 && s % 4 === 0) ch = '#'
            else if (y === wall.h - 1) ch = '='
            setChar(screenX, screenY, ch, wz)
          }
          if (s % 5 === 0) {
            const topY = baseY - wall.h
            setChar(screenX, topY, '#', wz)
            setChar(screenX, topY - 1, '#', wz)
          }
        }
      }

      // flags
      const flagTowers = [0, 1, 2, 8]
      flagTowers.forEach((idx) => {
        const ft = TOWERS[idx]
        const fRotX = ft.x * cosA - ft.z * sinA
        const fRotZ = ft.x * sinA + ft.z * cosA
        const fOffset = ft.r + 2
        const fTheta = angle + Math.PI + idx
        const fX = fRotX + fOffset * Math.cos(fTheta)
        const fZ = fRotZ + fOffset * Math.sin(fTheta)
        if (fZ > 0) {
          const screenFX = cx + fX
          const poleBase = baseY
          const poleHeight = ft.h + 4
          for (let y = 0; y < poleHeight; y++) {
            setChar(screenFX, poleBase - y, '|', fZ)
          }
          const flagTop = poleBase - poleHeight + 2
          const flagColor = idx === 0 ? '>' : '~'
          setChar(screenFX + 1, flagTop, flagColor, fZ)
          setChar(screenFX + 2, flagTop, flagColor, fZ)
          setChar(screenFX + 3, flagTop, flagColor, fZ)
          setChar(screenFX + 1, flagTop + 1, flagColor, fZ)
          setChar(screenFX + 2, flagTop + 1, flagColor, fZ)
        }
      })

      // painter's order: far to near
      const allElements: Array<{ type: 'wall' | 'tower'; data: unknown; z: number }> = [
        ...WALLS.map((w) => ({ type: 'wall' as const, data: w, z: 0 })),
        ...TOWERS.map((t) => ({ type: 'tower' as const, data: t, z: 0 })),
      ]
      allElements.forEach((el) => {
        if (el.type === 'wall') {
          const w = el.data as { from: number; to: number }
          const z1 = TOWERS[w.from].x * sinA + TOWERS[w.from].z * cosA
          const z2 = TOWERS[w.to].x * sinA + TOWERS[w.to].z * cosA
          el.z = (z1 + z2) / 2
        } else {
          const t = el.data as Tower
          el.z = t.x * sinA + t.z * cosA
        }
      })
      allElements.sort((a, b) => a.z - b.z)
      allElements.forEach((el) => {
        if (el.type === 'wall') drawWall(el.data as { from: number; to: number; h: number })
        else drawTower(el.data as Tower)
      })

      screen!.textContent = buf.map((row) => row.join('')).join('\n')
      angle += 0.015
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={wrapRef} className="ascii-castle-wrap">
      <div ref={boxRef} className="ascii-castle-box">
        <div ref={screenRef} className="ascii-castle" aria-hidden="true" />
      </div>
    </div>
  )
}
