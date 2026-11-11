export function groupTitle(groupNo: number) {
  const names = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  if (groupNo >= 1 && groupNo <= 10) return `第${names[groupNo - 1]}组`
  return `第${groupNo}组`
}
