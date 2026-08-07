export function formatWeddingDate(value) {
  if (!value) return ''

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return ''

  const [weekday] = new Intl.DateTimeFormat('zh-TW', {
    weekday: 'long',
  }).formatToParts(new Date(year, month - 1, day))
    .filter((part) => part.type === 'weekday')
    .map((part) => part.value)

  return `${year}年${month}月${day}日 ${weekday}`
}
