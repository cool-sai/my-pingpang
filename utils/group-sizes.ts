export function groupSizes(count: number) {
  if (count < 8) return null
  const groups = Math.ceil(count / 12)
  if (groups > Math.floor(count / 8)) return null
  const base = Math.floor(count / groups)
  const extra = count % groups
  const sizes: number[] = []
  for (let i = 0; i < groups; i += 1) sizes.push(i < extra ? base + 1 : base)
  return sizes
}

export function groupStartError(count: number) {
  const need = count < 8 ? 8 - count : 16 - count
  if (need > 0) return `再加 ${need} 人才能开启`
  return '这人数分不开'
}
