export const formatDate = function(date: Date, formatter: string) {
  if (typeof date !== 'object') {
    date = new Date(date)
  }
  const transform = function(value: number): string {
    return value < 10 ? `0${value}` : `${value}`
  }
  return formatter.replace(/^YYYY|MM|DD|hh|mm|ss/g, match => {
    switch (match) {
      case 'YYYY':
        return transform(date.getFullYear())
      case 'MM':
        return transform(date.getMonth() + 1)
      case 'mm':
        return transform(date.getMinutes())
      case 'DD':
        return transform(date.getDate())
      case 'hh':
        return transform(date.getHours())
      case 'ss':
        return transform(date.getSeconds())
      default:
        return ''
    }
  })
}
