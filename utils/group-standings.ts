export interface IGroupStanding {
  no: number
  label: string
  mine: boolean
  openid: string
  win: number
  lose: number
}

export function groupStandings(
  rows: Array<{ no: number; label: string; mine: boolean; openid?: string; cells: Array<{ mark: string }> }>
): IGroupStanding[] {
  return rows
    .map((row) => ({
      no: row.no,
      label: row.label,
      mine: row.mine,
      openid: row.openid || '',
      win: row.cells.filter((cell) => cell.mark === 'win').length,
      lose: row.cells.filter((cell) => cell.mark === 'lose').length
    }))
    .sort((a, b) => b.win - a.win || a.no - b.no)
}
